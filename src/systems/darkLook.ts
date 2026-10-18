/**
 * The look of the underground's light (Pixi-free, tested; `entities/DarknessLayer.ts` and `DitherFilter.ts` draw it). Core
 * engine and visual only: every page works it out from its own map and the players' positions, so a guest needs nothing
 * from the host. The dark is a few flat steps of shade, dithered between them like an old pixel game, never a smooth blob.
 */

/** How many shades the lit-to-dark ramp is cut into (the dark's own alpha is the last step). */
export const DARK_LEVELS = 4;
/** The glow of fire is cut the same way, a little finer. */
export const GLOW_LEVELS = 5;

/** The 4x4 ordered-dither thresholds, 0..15 (the shader is built from this same table). */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The threshold for a pixel in 0..1 (never 0 or 1, so a flat value of exactly a step never flips). */
export const bayerAt = (x: number, y: number): number => ((BAYER4[((y & 3) << 2) | (x & 3)] ?? 0) + 0.5) / 16;

/**
 * The step a pixel shows for a smooth value `t` in 0..1: 0..levels. Between two steps the pixel picks one or the other by
 * its place in the dither pattern, so a soft ramp becomes bands with a stippled edge.
 */
export function ditherLevel(t: number, levels: number, x: number, y: number): number {
  const v = Math.max(0, Math.min(1, t)) * levels;
  return Math.min(levels, Math.floor(v + bayerAt(x, y)));
}

/** The warm unsteadiness of the carried light: slower and gentler than a torch's, near 1 (`seed` tells two heroes apart). */
export function carriedFlicker(t: number, seed: number): number {
  return (
    1 + 0.035 * Math.sin(t * 5.1 + seed * 1.9) + 0.02 * Math.sin(t * 11.3 + seed * 0.7) + 0.012 * Math.sin(t * 2.3)
  );
}

/** The deep blue-black the unseen ground fades to (0xRRGGBB): not pure black, so a room never reads as a hole. */
export const FOG_COLOR = 0x070b1c;

/**
 * Where a hero's light falls off, as a profile of alpha (1 lit at the centre, 0 dark at the edge): flat in the middle
 * (a tight pool you can read the floor in), then a steady fall. Sampled at `n` evenly spaced radii.
 */
export function poolProfile(n: number, core = 0.32): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = i / (n - 1);
    const t = Math.max(0, Math.min(1, (r - core) / (1 - core)));
    out.push(1 - t * t * (3 - 2 * t)); // smoothstep: no kink where the core ends
  }
  return out;
}
