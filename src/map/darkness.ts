import type { MapData } from './types';

/** How many cells the fade reaches into the walkable ground. */
export const FADE_CELLS = 2;

/** Cells that are solid with no ground are the darkness at the edge of the world (`z.dark` in tools/map/zone.ts). */
export function darkCells(data: MapData): Set<number> {
  const out = new Set<number>();
  for (const i of data.collision) if (!data.ground[i]) out.add(i);
  return out;
}

/**
 * How black each cell is, 0..1 (row-major, width*height): 1 in the darkness itself, fading to 0 over `FADE_CELLS`
 * cells of open ground. `null` when the map has no darkness. Pixi-free so it can be tested and used by previews.
 */
export function darknessAlpha(data: MapData): Float32Array | null {
  const dark = darkCells(data);
  if (!dark.size) return null;
  const { width: W, height: H } = data;
  const out = new Float32Array(W * H);
  const R = FADE_CELLS;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      if (dark.has(row * W + col)) {
        out[row * W + col] = 1;
        continue;
      }
      let best = Infinity;
      for (let dy = -R; dy <= R; dy++) {
        const r = row + dy;
        if (r < 0 || r >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const c = col + dx;
          if (c < 0 || c >= W || !dark.has(r * W + c)) continue;
          best = Math.min(best, Math.hypot(dx, dy));
        }
      }
      if (best <= R) out[row * W + col] = Math.pow(Math.max(0, 1 - (best - 1) / R), 1.5);
    }
  }
  return out;
}
