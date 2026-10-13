import { describe, expect, it } from 'vitest';
import { cellsOutline, roundOff } from './outline';

/** Twice the signed area of a loop (positive: clockwise on screen, y down). */
const area = (loop: [number, number][]) =>
  loop.reduce((a, [x1, y1], i) => {
    const [x2, y2] = loop[(i + 1) % loop.length]!;
    return a + x1 * y2 - x2 * y1;
  }, 0);

describe('cellsOutline', () => {
  it('rings a single cell halfway out into its neighbours', () => {
    const loops = cellsOutline([0], 1, 0.5, 0);
    expect(loops).toHaveLength(1);
    const xs = loops[0]!.map(([x]) => x);
    const ys = loops[0]!.map(([, y]) => y);
    expect(Math.min(...xs)).toBe(-0.5);
    expect(Math.max(...xs)).toBe(1.5);
    expect(Math.min(...ys)).toBe(-0.5);
    expect(Math.max(...ys)).toBe(1.5);
    expect(area(loops[0]!)).toBeGreaterThan(0); // clockwise on screen
  });

  it('makes one loop of a solid block and of cells that only touch at a corner', () => {
    // A 3x3 block in a 5-wide map.
    expect(cellsOutline([6, 7, 8, 11, 12, 13, 16, 17, 18], 5)).toHaveLength(1);
    // Two cells touching diagonally: the corner they share joins them.
    expect(cellsOutline([0, 6], 5)).toHaveLength(1);
    // Two cells far apart: two loops.
    expect(cellsOutline([0, 4], 5)).toHaveLength(2);
  });

  it('reaches further out the larger `reach` is, and is empty for no cells', () => {
    const span = (reach: number) => Math.max(...cellsOutline([0], 1, reach, 0)[0]!.map(([x]) => x));
    expect(span(0.7)).toBeGreaterThan(span(0.5));
    expect(cellsOutline([], 4)).toEqual([]);
  });

  it('rounds off corners without moving outside the loop', () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const round = roundOff(square, 2);
    expect(round).toHaveLength(16);
    for (const [x, y] of round) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});
