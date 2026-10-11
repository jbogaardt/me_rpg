import type { MapData } from './types';

/** How many cells (a fraction is fine) the fade reaches into the walkable ground. */
export const FADE_CELLS = 1.5;

/** Cells that are solid with no ground are the darkness at the edge of the world (`z.dark` in tools/map/zone.ts). */
export function darkCells(data: MapData): Set<number> {
  const out = new Set<number>();
  for (const i of data.collision) if (!data.ground[i]) out.add(i);
  return out;
}

/** Samples per cell side in the darkness image, so a fade narrower than a cell still has a smooth edge. */
export const DARK_SCALE = 8;

/**
 * How black the ground is, 0..1, sampled `scale` times per cell side (row-major, `width*scale` by `height*scale`): 1 in
 * the darkness itself, fading to 0 over `FADE_CELLS` of open ground. `null` when the map has no darkness. Pixi-free so
 * it can be tested and used by previews.
 */
export function darknessAlpha(data: MapData, scale = DARK_SCALE): Float32Array | null {
  const dark = darkCells(data);
  if (!dark.size) return null;
  const { width: W, height: H } = data;
  const SW = W * scale;
  const out = new Float32Array(SW * H * scale);
  const reach = Math.ceil(FADE_CELLS);
  for (let sy = 0; sy < H * scale; sy++) {
    const py = (sy + 0.5) / scale;
    const row = Math.floor(py);
    for (let sx = 0; sx < SW; sx++) {
      const px = (sx + 0.5) / scale;
      const col = Math.floor(px);
      if (dark.has(row * W + col)) {
        out[sy * SW + sx] = 1;
        continue;
      }
      let best = Infinity;
      for (let r = Math.max(0, row - reach); r <= Math.min(H - 1, row + reach); r++) {
        for (let c = Math.max(0, col - reach); c <= Math.min(W - 1, col + reach); c++) {
          if (!dark.has(r * W + c)) continue;
          best = Math.min(best, Math.hypot(Math.max(c - px, 0, px - c - 1), Math.max(r - py, 0, py - r - 1)));
        }
      }
      if (best < FADE_CELLS) out[sy * SW + sx] = Math.pow(1 - best / FADE_CELLS, 1.2);
    }
  }
  return out;
}
