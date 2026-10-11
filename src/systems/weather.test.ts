import { describe, expect, it } from 'vitest';
import { mulberry32 } from './particles';
import { isAllowed, sampleBiome, Weather, WEATHER_TABLE, type Biome, type WeatherKind } from './weather';

function run(biome: Biome, seconds: number, seed = 1): Set<WeatherKind> {
  const w = new Weather(biome, mulberry32(seed));
  const seen = new Set<WeatherKind>();
  for (let t = 0; t < seconds; t += 0.25) {
    w.update(0.25, biome);
    if (w.intensity > 0) seen.add(w.kind);
  }
  return seen;
}

describe('WEATHER_TABLE', () => {
  it('never rains in the desert or the tundra, and only snows in the tundra', () => {
    for (const kind of ['rain', 'storm'] as const) {
      expect(isAllowed('desert', kind)).toBe(false);
      expect(isAllowed('tundra', kind)).toBe(false);
    }
    expect(isAllowed('plains', 'snow')).toBe(false);
    expect(isAllowed('desert', 'snow')).toBe(false);
    expect(isAllowed('tundra', 'snow')).toBe(true);
    expect(isAllowed('desert', 'sandstorm')).toBe(true);
    expect(isAllowed('plains', 'wind')).toBe(true);
  });
});

describe('Weather', () => {
  it.each(Object.keys(WEATHER_TABLE) as Biome[])(
    'only produces %s weather over a long time, and all of it',
    (biome) => {
      const seen = run(biome, 60 * 60 * 3);
      for (const kind of seen) expect(isAllowed(biome, kind)).toBe(true);
      for (const kind of Object.keys(WEATHER_TABLE[biome]) as WeatherKind[]) expect(seen.has(kind)).toBe(true);
    },
  );

  it('fades in gradually instead of popping', () => {
    const w = new Weather('plains', mulberry32(3));
    w.update(0.25, 'plains');
    expect(w.intensity).toBeLessThan(0.1);
  });

  it('ends rain after walking into the desert', () => {
    const w = new Weather('plains', mulberry32(1));
    w.force('rain');
    for (let t = 0; t < 20; t += 0.25) w.update(0.25, 'desert');
    expect(w.biome).toBe('desert');
    expect(!(w.intensity > 0 && w.kind === 'rain')).toBe(true);
    expect(isAllowed('desert', w.kind)).toBe(true);
  });

  it('ignores a brief visit to another biome', () => {
    const w = new Weather('plains', mulberry32(1));
    w.force('rain');
    w.update(0.5, 'desert');
    w.update(0.5, 'plains');
    w.update(0.5, 'desert');
    expect(w.biome).toBe('plains');
    expect(w.kind).toBe('rain');
  });

  it('blows with a sign and strength that follow the weather', () => {
    const w = new Weather('plains', mulberry32(1));
    w.force('wind');
    w.windDir = -1;
    expect(w.wind).toBeLessThan(0);
    w.force('clear');
    expect(Math.abs(w.wind)).toBe(0);
  });
});

describe('sampleBiome', () => {
  const surfaces = ['grass', 'sand', 'snow', 'water'];
  const row = (...ids: number[]) => ids;
  const data = {
    width: 4,
    height: 1,
    surfaces,
    surface: row(0, 1, 1, 3),
  };

  it('takes the most common biome around the point', () => {
    expect(sampleBiome(data, 48, 16, 3)).toBe('desert');
    expect(sampleBiome({ ...data, surface: row(2, 2, 0, 3) }, 16, 16, 3)).toBe('tundra');
  });

  it('is null over neutral ground only', () => {
    expect(sampleBiome({ ...data, surface: row(3, 3, 3, 3) }, 16, 16, 3)).toBeNull();
  });
});
