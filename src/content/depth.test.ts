import { describe, expect, it } from 'vitest';
import { MAX_BAND } from '../systems/bands';
import { depthBand, depthLevel } from './depth';

describe('depth bands', () => {
  it('starts gentle: the start region is for levels 1 to 3', () => {
    expect(depthBand(0).levels).toEqual([1, 3]);
    expect(depthBand(0).level).toBe(2);
  });

  it('rises about a level per region at first, never falls, and flattens', () => {
    const levels = Array.from({ length: 200 }, (_, d) => depthLevel(d));
    for (let d = 1; d < levels.length; d++) expect(levels[d]).toBeGreaterThanOrEqual(levels[d - 1]!);
    expect(levels[3]! - levels[0]!).toBeGreaterThanOrEqual(3);
    expect(levels[3]! - levels[0]!).toBeLessThanOrEqual(3);
    const early = levels[10]! - levels[0]!;
    const late = levels[110]! - levels[100]!;
    expect(late).toBeLessThan(early);
  });

  it('is capped at MAX_BAND and keeps its boss at the top of the band', () => {
    expect(depthLevel(10_000)).toBe(MAX_BAND);
    expect(depthBand(10_000).levels[1]).toBe(MAX_BAND);
    const b = depthBand(5);
    expect(b.top).toBe(b.levels[1]);
    expect(b.levels[0]).toBeLessThanOrEqual(b.level);
  });

  it('is a pure function of depth (odd input is treated as a whole depth of at least 0)', () => {
    expect(depthLevel(-3)).toBe(depthLevel(0));
    expect(depthLevel(2.9)).toBe(depthLevel(2));
  });
});
