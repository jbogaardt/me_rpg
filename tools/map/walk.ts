import { CELL, type MapData } from '../../src/map/types';
import { Collision } from '../../src/systems/collision';

const STEP = 4; // px between the feet positions tried
/** Where a body stands on a cell: the middle, at the bottom (src/scenes/overworld cellFeet). */
export const feetOf = (col: number, row: number): [number, number] => [col * CELL + CELL / 2, row * CELL + CELL - 4];

export interface Walk {
  /** Whether the walk reached feet at (x, y), within a cell. */
  reached(col: number, row: number): boolean;
  /** How many cells away (the largest of |dcol| and |drow|) the walk got from where it started. */
  far: number;
  start: boolean;
}

/**
 * Walk a player's collision box (the real `Collision`, not just open cells) in all four directions from a cell: every
 * place the feet can get to (stopping early once `enough` cells away). This is what finds a gap that looks open on the map and is a dead end for a body.
 */
export function walkFrom(d: MapData, col: number, row: number, enough = Infinity, limit = 20_000_000): Walk {
  const hit = new Collision(d.width, d.height, d.collision);
  const [sx, sy] = feetOf(col, row);
  const w = d.width * CELL,
    h = d.height * CELL;
  const seen = new Uint8Array(Math.ceil(w / STEP) * Math.ceil(h / STEP));
  const stride = Math.ceil(w / STEP);
  const key = (x: number, y: number) => Math.floor(y / STEP) * stride + Math.floor(x / STEP);
  const start = hit.fitsMap(sx, sy);
  const reachedCells = new Set<number>();
  let far = 0;
  if (start) {
    const stack: [number, number][] = [[sx, sy]];
    seen[key(sx, sy)] = 1;
    let n = 0;
    while (stack.length && n++ < limit && far < enough) {
      const [x, y] = stack.pop()!;
      const c = Math.floor(x / CELL),
        r = Math.floor(y / CELL);
      reachedCells.add(r * d.width + c);
      far = Math.max(far, Math.abs(c - col), Math.abs(r - row));
      for (const [dx, dy] of [
        [STEP, 0],
        [-STEP, 0],
        [0, STEP],
        [0, -STEP],
      ] as const) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[key(nx, ny)] || !hit.fitsMap(nx, ny)) continue;
        seen[key(nx, ny)] = 1;
        stack.push([nx, ny]);
      }
    }
  }
  return { reached: (c, r) => reachedCells.has(r * d.width + c), far, start };
}
