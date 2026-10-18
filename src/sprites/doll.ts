// The "doll sheet": one fixed layout that every character layer (body, head, hair, armor, weapon, ...) is packed
// into by tools/sprites, so layers can be stacked frame-for-frame at runtime. Pixi-free: shared by the build tool,
// the compositor and the tests.
//
// Layers come from the Universal LPC Spritesheet Character Generator (see CREDITS.md). Rows within an animation are
// always up, left, down, right (LPC order). Walk/idle/cast/hurt use 64px frames; the weapon swing uses 128px frames
// because blades reach outside a 64px cell (the character is centred in them).

import type { Direction } from '../core/direction';
export type { Direction };

/** Row order inside every animation block. */
export const DIR_ROW: Record<Direction, number> = { up: 0, left: 1, down: 2, right: 3 };

export type AnimName = 'walk' | 'idle' | 'cast' | 'hurt' | 'slash' | 'shoot';

export interface AnimBlock {
  /** Top-left of the block on the sheet. */
  y: number;
  /** Frame edge in px (frames are square). */
  size: number;
  cols: number;
  /** 4 = one row per direction, 1 = a single row shared by every direction. */
  rows: 4 | 1;
  /** Frame columns in playback order. */
  cycle: readonly number[];
  /** Milliseconds per cycle step. */
  ms: number;
  /** Plays once then stops (attacks, hurt) rather than looping. */
  once: boolean;
}

export const ANIMS: Record<AnimName, AnimBlock> = {
  // LPC walk: column 0 is the neutral pose, columns 1-8 are the stride.
  walk: { y: 0, size: 64, cols: 9, rows: 4, cycle: [1, 2, 3, 4, 5, 6, 7, 8], ms: 90, once: false },
  idle: { y: 256, size: 64, cols: 2, rows: 4, cycle: [0, 0, 0, 1], ms: 350, once: false },
  cast: { y: 512, size: 64, cols: 7, rows: 4, cycle: [0, 1, 2, 3, 4, 5, 6], ms: 60, once: true },
  hurt: { y: 768, size: 64, cols: 6, rows: 1, cycle: [0, 1, 2, 3, 4, 5], ms: 70, once: true },
  slash: { y: 832, size: 128, cols: 6, rows: 4, cycle: [0, 1, 2, 3, 4, 5], ms: 55, once: true },
  // LPC bow draw: 13 frames, the string is drawn back over columns 3-8 and let go at column 9. The shot plays from the
  // full draw (column 5), so the arrow leaves `SHOOT_RELEASE_MS` after the button is pressed.
  shoot: { y: 1344, size: 64, cols: 13, rows: 4, cycle: [5, 6, 7, 8, 9, 10, 11, 12], ms: 50, once: true },
};

/** Milliseconds from the start of the `shoot` animation to the frame where the string is let go (column 9). */
export const SHOOT_RELEASE_MS = ANIMS.shoot.cycle.indexOf(9) * ANIMS.shoot.ms;

export const ANIM_NAMES = Object.keys(ANIMS) as AnimName[];

export const DOLL_WIDTH = 832; // 13 shoot frames of 64 (the 6 slash frames of 128 are narrower)
export const DOLL_HEIGHT = 1344 + 4 * 64;

/** Pixel rectangle of one frame on the sheet. */
export function frameRect(anim: AnimName, dir: Direction, col: number) {
  const a = ANIMS[anim];
  const row = a.rows === 1 ? 0 : DIR_ROW[dir];
  return { x: col * a.size, y: a.y + row * a.size, w: a.size, h: a.size };
}

/** Where the character's feet are inside a 64px frame (bottom of the LPC body sheets' feet) and the 128px equivalent. */
export const FEET_Y_64 = 62;

/** Anchor y of a frame, so the container origin sits between the feet whatever the frame size. */
export const feetAnchor = (anim: AnimName) => (FEET_Y_64 + (ANIMS[anim].size - 64) / 2) / ANIMS[anim].size;

/** Total playback length of one pass of an animation, in ms. */
export const animDuration = (anim: AnimName) => ANIMS[anim].cycle.length * ANIMS[anim].ms;

// --- Parts and outfits ---

/** One drawable layer of a part. Lower `z` is drawn first (behind). */
export interface PartLayer {
  /** File under public/sprites/lpc/. */
  file: string;
  z: number;
}

/** Contents of public/sprites/lpc/parts.json, written by `npm run sprites`. */
export type PartManifest = Record<string, PartLayer[]>;

/** The slots a character can fill. Each slot holds at most one part. */
export const SLOTS = [
  'body',
  'head',
  'eyes',
  'hair',
  'beard',
  'torso',
  'arms',
  'legs',
  'feet',
  'hands',
  'cape',
  'headwear',
  'weapon',
  'shield',
] as const;
export type Slot = (typeof SLOTS)[number];

/** Part ids by slot. Part ids are the keys of `sprites/parts.ts` (and of the manifest). */
export type Outfit = Partial<Record<Slot, string>>;

/** Stable cache key for an outfit. */
export function outfitKey(outfit: Outfit): string {
  return SLOTS.filter((s) => outfit[s])
    .map((s) => `${s}=${outfit[s]}`)
    .join(';');
}

/** The part ids an outfit uses, in slot order. */
export function outfitParts(outfit: Outfit): string[] {
  return SLOTS.flatMap((s) => (outfit[s] ? [outfit[s]] : []));
}

/** `base` with `change` laid over it; a slot set to `null` is emptied. */
export function withGear(base: Outfit, change: Partial<Record<Slot, string | null>>): Outfit {
  const next: Outfit = { ...base };
  for (const [slot, id] of Object.entries(change) as [Slot, string | null][]) {
    if (id === null) delete next[slot];
    else next[slot] = id;
  }
  return next;
}

/** All layers of an outfit, back to front. Ties keep slot order, so the result is deterministic. */
export function outfitLayers(outfit: Outfit, manifest: PartManifest): PartLayer[] {
  const layers: PartLayer[] = [];
  for (const id of outfitParts(outfit)) {
    const part = manifest[id];
    if (!part) throw new Error(`Unknown sprite part "${id}"`);
    layers.push(...part);
  }
  return layers
    .map((layer, i) => ({ layer, i }))
    .sort((a, b) => a.layer.z - b.layer.z || a.i - b.i)
    .map((e) => e.layer);
}
