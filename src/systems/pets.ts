// Town pets (Pixi-free, tested): the dogs and cats that doze around the zones. They are not enemies and have no stats:
// the action key next to one makes it answer in its own language. Art: public/sprites/pets/{dogs,cats}.png.

import type { Direction } from '../core/direction';

/** Size of one frame in a pet sheet. */
export const PET_FRAME = 32;

export type PetSheet = 'dogs' | 'cats' | 'rat';

export interface PetKind {
  species: 'dog' | 'cat' | 'rat';
  /** Which sheet it is drawn from, and which of the four animals on it (each takes four columns). */
  sheet: PetSheet;
  slot: number;
  /** Row of each facing in the sheet. */
  rows: Record<Direction, number>;
  /** Whether it has a lying-down frame (column 3, drawn side-on); a pet without one only stands. */
  lies: boolean;
  /** Frames cycled while standing (a rat's twitching tail); 1 holds still. */
  idleFrames: number;
  /** Columns one animal takes in its sheet. */
  cols: number;
  /** What it says when spoken to, in turn. */
  sounds: string[];
}

const QUAD = { right: 0, up: 1, down: 2, left: 3 } as const;
const DOG = ['Woof!', 'Woof woof!', 'Arf!', 'Ruff ruff!'];
const CAT = ['Meow!', 'Meow meow?', 'Mrrrow!', 'Purrrr...'];
const RAT = ['Squeak!', 'Squeak squeak!', 'Eek!', 'Squeee!'];
const CRITTER = { rows: QUAD, lies: true, idleFrames: 1, cols: 4 };

export const PET_KINDS: Record<string, PetKind> = {
  dog_white: { species: 'dog', sheet: 'dogs', ...CRITTER, slot: 0, sounds: DOG },
  dog_brown: { species: 'dog', sheet: 'dogs', ...CRITTER, slot: 1, sounds: DOG },
  dog_tan: { species: 'dog', sheet: 'dogs', ...CRITTER, slot: 2, sounds: DOG },
  dog_black: { species: 'dog', sheet: 'dogs', ...CRITTER, slot: 3, sounds: DOG },
  cat_white: { species: 'cat', sheet: 'cats', ...CRITTER, slot: 0, sounds: CAT },
  cat_tan: { species: 'cat', sheet: 'cats', ...CRITTER, slot: 1, sounds: CAT },
  cat_ginger: { species: 'cat', sheet: 'cats', ...CRITTER, slot: 2, sounds: CAT },
  cat_black: { species: 'cat', sheet: 'cats', ...CRITTER, slot: 3, sounds: CAT },
  rat: {
    species: 'rat',
    sheet: 'rat',
    slot: 0,
    rows: { down: 0, left: 1, right: 2, up: 3 },
    lies: false,
    idleFrames: 3,
    cols: 3,
    sounds: RAT,
  },
};

/** What a pet says the `n`th time it is spoken to (cycles through its sounds). */
export function petSound(kind: PetKind, n: number): string {
  const sounds = kind.sounds;
  return sounds[((n % sounds.length) + sounds.length) % sounds.length] ?? '...';
}

export type PetPose = 'stand' | 'lie';

/**
 * The pose a pet is in `t` seconds into the game: it stands a while, then lies down a while, on a cycle of its own
 * (`seed` staggers neighbours so they don't all lie down at once).
 */
export function petPose(t: number, seed: number): PetPose {
  const stand = 7 + (seed % 5);
  const lie = 10 + (seed % 7);
  const phase = (((t + seed * 3.7) % (stand + lie)) + stand + lie) % (stand + lie);
  return phase < stand ? 'stand' : 'lie';
}

/**
 * The source rectangle of a pet's frame in its sheet. A walk takes columns 0-2 and a lying frame is column 3 (side-on:
 * only left or right); `step` picks the standing frame of a pet that cycles them (`idleFrames`).
 */
export function petFrame(
  kind: PetKind,
  pose: PetPose,
  dir: Direction,
  step = 0,
): { x: number; y: number; w: number; h: number } {
  const lying = pose === 'lie' && kind.lies;
  const row = kind.rows[lying && dir !== 'left' ? 'right' : dir];
  const col = lying ? 3 : ((step % kind.idleFrames) + kind.idleFrames) % kind.idleFrames;
  return { x: (kind.slot * kind.cols + col) * PET_FRAME, y: row * PET_FRAME, w: PET_FRAME, h: PET_FRAME };
}
