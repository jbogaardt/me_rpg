import { describe, expect, it } from 'vitest';
import { mulberry32 } from './particles';
import {
  CLEAR_SHARE,
  CLIMATES,
  LEAN,
  Lightning,
  PRECIPS,
  Weather,
  WIND_LEVELS,
  type ClimateName,
  type Precip,
} from './weather';

/** Run a weather for `hours` and tally what it did: seconds spent clear, and what showed up while it was not. */
function observe(climate: ClimateName, seed: number, hours = 60) {
  const w = new Weather(CLIMATES[climate], mulberry32(seed));
  const seen = { precip: new Set<Precip>(), rainOnly: 0, windOnly: 0, both: 0, clear: 0, total: 0 };
  for (let t = 0; t < 3600 * hours; t += 0.5) {
    w.update(0.5);
    if (w.intensity < 0.99) continue; // count the settled weather, not the fades
    seen.total++;
    if (w.clear) seen.clear++;
    else if (w.precip && w.windLevel > 0) seen.both++;
    else if (w.precip) seen.rainOnly++;
    else seen.windOnly++;
    if (w.precip) seen.precip.add(w.precip);
  }
  return seen;
}

describe('Weather', () => {
  it('is clear 80% of the time, and the rest is precipitation, wind or both', () => {
    const s = observe('temperate', 1);
    expect(s.clear / s.total).toBeGreaterThan(CLEAR_SHARE - 0.06);
    expect(s.clear / s.total).toBeLessThan(CLEAR_SHARE + 0.06);
    // All three kinds of event happen, and none dominates.
    expect(s.rainOnly).toBeGreaterThan(0);
    expect(s.windOnly).toBeGreaterThan(0);
    expect(s.both).toBeGreaterThan(0);
  });

  it('keeps each biome to its own precipitation: snow only in the frost, sandstorms only in the desert', () => {
    const where = new Map<Precip, ClimateName[]>();
    for (const climate of Object.keys(CLIMATES) as ClimateName[]) {
      for (const p of observe(climate, 2, 40).precip) where.set(p, [...(where.get(p) ?? []), climate]);
    }
    expect(where.get('snow')).toEqual(['frost']);
    expect(where.get('blizzard')).toEqual(['frost']);
    expect(where.get('sand')).toEqual(['desert']);
    expect(where.get('ash')).toEqual(['undead']);
    for (const wet of ['rain', 'storm'] as const) {
      expect(where.get(wet)).not.toContain('desert');
      expect(where.get(wet)).not.toContain('frost');
    }
    // Every precipitation the game knows is somebody's weather.
    for (const p of PRECIPS) expect(where.has(p)).toBe(true);
  });

  it('can blow without anything falling, and fall without any extra wind', () => {
    const w = new Weather(CLIMATES.temperate, mulberry32(1));
    w.force(null, WIND_LEVELS.gale);
    expect(w.precip).toBeNull();
    expect(w.clear).toBe(false);
    expect(Math.abs(w.wind)).toBeCloseTo(WIND_LEVELS.gale, 5);
    w.force('rain');
    expect(w.windLevel).toBe(0);
    expect(Math.abs(w.wind)).toBeCloseTo(LEAN.rain, 5); // rain leans a little by itself
    w.force('rain', WIND_LEVELS.gale);
    expect(Math.abs(w.wind)).toBeCloseTo(WIND_LEVELS.gale, 5); // a gale on top of it
    w.force(null, 0);
    expect(w.clear).toBe(true);
    expect(Math.abs(w.wind)).toBe(0);
  });

  it('blows with a sign that follows the direction', () => {
    const w = new Weather(CLIMATES.coast, mulberry32(1));
    w.force(null, WIND_LEVELS.breeze);
    w.windDir = -1;
    expect(w.wind).toBeLessThan(0);
    w.windDir = 1;
    expect(w.wind).toBeGreaterThan(0);
  });

  it('fades in gradually instead of popping', () => {
    const w = new Weather(CLIMATES.frost, mulberry32(3));
    w.force('snow');
    w.intensity = 0;
    w.update(0.25);
    expect(w.intensity).toBeLessThan(0.1);
  });

  it('lets a weather event last a minute and a half to three minutes', () => {
    const w = new Weather(CLIMATES.jungle, mulberry32(2));
    w.force('rain');
    let t = 0;
    while (w.remaining > 0) {
      w.update(0.25);
      t += 0.25;
    }
    expect(t).toBeGreaterThanOrEqual(90);
    expect(t).toBeLessThanOrEqual(181);
  });

  it('two zones of one climate do not share a sky', () => {
    const a = new Weather(CLIMATES.temperate, mulberry32(1));
    const b = new Weather(CLIMATES.temperate, mulberry32(2));
    a.force('storm');
    expect(b.precip).not.toBe('storm');
  });
});

describe('Lightning', () => {
  it('stays quiet outside a storm and strikes every few seconds inside one', () => {
    const l = new Lightning(mulberry32(5));
    let quiet = 0;
    for (let t = 0; t < 60; t += 0.1) if (l.update(0.1, false)) quiet++;
    expect(quiet).toBe(0);
    let strikes = 0;
    for (let t = 0; t < 120; t += 0.1) if (l.update(0.1, true)) strikes++;
    expect(strikes).toBeGreaterThan(8);
    expect(strikes).toBeLessThan(60);
  });

  it('strikes only in a storm that has built up, through the weather', () => {
    const w = new Weather(CLIMATES.jungle, mulberry32(4));
    w.force('rain');
    let rainStrikes = 0;
    for (let t = 0; t < 120; t += 0.1) if (w.strikeDue(0.1)) rainStrikes++;
    expect(rainStrikes).toBe(0);
    w.force('storm');
    let stormStrikes = 0;
    for (let t = 0; t < 120; t += 0.1) if (w.strikeDue(0.1)) stormStrikes++;
    expect(stormStrikes).toBeGreaterThan(8);
  });
});

describe('co-op weather sync', () => {
  it('a guest ends up with exactly the host weather', () => {
    const host = new Weather(CLIMATES.frost, mulberry32(7));
    host.force('blizzard', WIND_LEVELS.gale);
    host.windDir = -1;
    host.update(1);
    const guest = new Weather(CLIMATES.desert, mulberry32(99)); // whatever the guest would have rolled is replaced
    guest.setRemote(host.snapshot());
    expect(guest.precip).toBe('blizzard');
    expect(guest.windLevel).toBeCloseTo(WIND_LEVELS.gale, 2);
    expect(guest.windDir).toBe(-1);
    expect(guest.intensity).toBeCloseTo(host.intensity, 2);
  });

  it('survives a bad snapshot without breaking', () => {
    const guest = new Weather(CLIMATES.temperate, mulberry32(1));
    guest.setRemote([99, 500, 500, 1]);
    expect(guest.precip).toBeNull();
    expect(guest.intensity).toBe(1);
    expect(guest.windLevel).toBe(1);
  });
});
