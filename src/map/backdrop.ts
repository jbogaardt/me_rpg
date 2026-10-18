// The far backdrop of an underground zone (core engine, cosmetic, `parallax` capability): what shows through the cells a
// map leaves with no ground (the rock mass beyond a cave's walls). Two layers of a slow-moving dark cavern, the far one
// scrolling least, so the floor reads as a platform with depth under and beyond it. Pixi-free: the palettes and the
// maths; `BackdropLayer.ts` draws them. Visual only, built from the map and the camera, so a co-op guest needs nothing.

export interface BackdropStyle {
  /** The deepest dark: the flat colour behind everything. */
  base: number;
  /** Far layer: the mottling of distant rock, a little lighter than `base`. */
  far: number;
  /** Near layer: the silhouettes of rock columns standing out of the dark, and the lit rim along their top-left edge. */
  near: number;
  rim: number;
  /** A few faint glints (embers, damp, bones) drifting in the far layer. */
  glint: number;
}

export const BACKDROPS = {
  cave: { base: 0x1a1214, far: 0x24191b, near: 0x2f2022, rim: 0x4a3330, glint: 0x8a4a2a },
  rock: { base: 0x1b1315, far: 0x251a1c, near: 0x30211f, rim: 0x5a3a30, glint: 0xb0562a },
  sewer: { base: 0x0f1614, far: 0x16211e, near: 0x1d2c27, rim: 0x2f4a40, glint: 0x4a7a5a },
  crypt: { base: 0x14141a, far: 0x1c1c25, near: 0x262633, rim: 0x403f55, glint: 0x6a6a9a },
} as const satisfies Record<string, BackdropStyle>;
export type BackdropName = keyof typeof BACKDROPS;

export const isBackdrop = (name: string): name is BackdropName => name in BACKDROPS;

/** The `parallax` capability's `depth` setting (0..1) as how fast each layer scrolls, as a share of the camera's move. */
export interface Factors {
  far: number;
  near: number;
}

/**
 * 1 scrolls with the floor (no depth, what the capability off gives); a depth of 0.6 (the default) scrolls the far
 * layer at 0.4 and the near one at 0.67, so the layers part as the camera moves.
 */
export function factors(depth: number): Factors {
  const d = Math.min(1, Math.max(0, depth));
  return { far: 1 - d, near: 1 - d * 0.55 };
}

/**
 * Where a layer's texture sits for a camera at `view` (world px): whole pixels, so the nearest-scaled art never shimmers.
 * The sprite is laid over the view, so the texture must slide by the camera's move times the layer's factor.
 */
export function tileOffset(view: { x: number; y: number }, factor: number): { x: number; y: number } {
  return { x: -Math.round(view.x * factor), y: -Math.round(view.y * factor) };
}
