import { describe, expect, it } from 'vitest';
import { mulberry32 } from './particles';
import { Lightning, Weather, WEATHER_TABLE, type WeatherKind } from './weather';

describe('Weather', () => {
  it('covers the whole map: every kind turns up over a long time, snow and sand included', () => {
    const w = new Weather(mulberry32(1));
    const seen = new Set<WeatherKind>();
    for (let t = 0; t < 60 * 60 * 3; t += 0.25) {
      w.update(0.25);
      if (w.intensity > 0) seen.add(w.kind);
    }
    for (const kind of Object.keys(WEATHER_TABLE) as WeatherKind[]) expect(seen.has(kind)).toBe(true);
  });

  it('fades in gradually instead of popping', () => {
    const w = new Weather(mulberry32(3));
    w.update(0.25);
    expect(w.intensity).toBeLessThan(0.1);
  });

  it('blows with a sign and strength that follow the weather', () => {
    const w = new Weather(mulberry32(1));
    w.force('wind');
    w.windDir = -1;
    expect(w.wind).toBeLessThan(0);
    w.force('clear');
    expect(Math.abs(w.wind)).toBe(0);
  });

  it('rain, storms and snow last about three minutes', () => {
    for (const kind of ['rain', 'storm', 'snow'] as const) {
      const w = new Weather(mulberry32(2));
      w.force(kind);
      let t = 0;
      while (w.remaining > 0) {
        w.update(0.25);
        t += 0.25;
      }
      expect(t).toBeGreaterThanOrEqual(150);
    }
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
});

describe('co-op weather sync', () => {
  it('a guest ends up with exactly the host weather', () => {
    const host = new Weather(mulberry32(7));
    host.force('blizzard');
    host.windDir = -1;
    host.update(1);
    const guest = new Weather(mulberry32(99));
    guest.setRemote(host.snapshot());
    expect(guest.kind).toBe('blizzard');
    expect(guest.windDir).toBe(-1);
    expect(guest.intensity).toBeCloseTo(host.intensity, 2);
  });

  it('survives a bad snapshot without breaking', () => {
    const guest = new Weather(mulberry32(1));
    guest.setRemote([99, 500, 1]);
    expect(guest.kind).toBe('clear');
    expect(guest.intensity).toBe(1);
  });
});
