import { describe, expect, it } from 'vitest';
import { reflectionOf, waterRects } from './waterRuns';

/** A map from rows of text: `~` sewer water, anything else floor. */
function map(rows: string[]) {
  return {
    width: rows[0]!.length,
    height: rows.length,
    surfaces: ['sewerFloor', 'sewerWater'],
    surface: rows.flatMap((r) => [...r].map((c) => (c === '~' ? 1 : 0))),
  };
}

describe('waterRects', () => {
  it('makes a channel one rectangle however long', () => {
    expect(waterRects(map(['........', '.~~~~~~.', '.~~~~~~.', '........']))).toEqual([{ col: 1, row: 1, w: 6, h: 2 }]);
  });
  it('covers a round pool exactly, in a few stacked rectangles', () => {
    const m = map(['.....', '..~..', '.~~~.', '..~..', '.....']);
    const r = waterRects(m);
    const covered: number[] = [];
    for (const q of r)
      for (let y = q.row; y < q.row + q.h; y++) for (let x = q.col; x < q.col + q.w; x++) covered.push(y * m.width + x);
    const wet = m.surface.flatMap((s, i) => (s === 1 ? [i] : []));
    expect(covered.sort((a, b) => a - b)).toEqual(wet);
    expect(r.length).toBe(3);
  });
  it('finds no water in a dry map', () => {
    expect(waterRects(map(['....', '....']))).toEqual([]);
  });
  it('knows the cave water too', () => {
    const m = { width: 3, height: 1, surfaces: ['caveFloor', 'caveWater'], surface: [0, 1, 0] };
    expect(waterRects(m)).toEqual([{ col: 1, row: 0, w: 1, h: 1 }]);
  });
});

describe('reflectionOf', () => {
  const rects = [{ col: 2, row: 6, w: 6, h: 3 }];
  it('falls on the water straight below a torch', () => {
    expect(reflectionOf(100, 100, rects)).toEqual({ x: 100, top: 192, bottom: 288 });
  });
  it('is none when the water is beside, above or far below', () => {
    expect(reflectionOf(20, 100, rects)).toBeNull();
    expect(reflectionOf(100, 400, rects)).toBeNull();
    expect(reflectionOf(100, -300, rects)).toBeNull();
  });
});
