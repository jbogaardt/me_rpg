// Town pets (Pixi-free, tested): the dogs and cats that doze around the zones. They are not enemies and have no stats:
// the action key next to one makes it answer in its own language. Art: public/sprites/pets/{dogs,cats}.png.

import type { Direction } from '../core/direction';

/** Size of one frame in a pet sheet. */
export const PET_FRAME = 32;

export type PetSheet = 'dogs' | 'cats';

export interface PetKind {
  species: 'dog' | 'cat';
  /** Which sheet it is drawn from, and which of the four animals on it (each takes four columns). */
  sheet: PetSheet;
  slot: number;
  /** What it says when spoken to, in turn. */
  sounds: string[];
}

const DOG = ['Woof!', 'Woof woof!', 'Arf!', 'Ruff ruff!'];
const CAT = ['Meow!', 'Meow meow?', 'Mrrrow!', 'Purrrr...'];

export const PET_KINDS: Record<string, PetKind> = {
  dog_white: { species: 'dog', sheet: 'dogs', slot: 0, sounds: DOG },
  dog_brown: { species: 'dog', sheet: 'dogs', slot: 1, sounds: DOG },
  dog_tan: { species: 'dog', sheet: 'dogs', slot: 2, sounds: DOG },
  dog_black: { species: 'dog', sheet: 'dogs', slot: 3, sounds: DOG },
  cat_white: { species: 'cat', sheet: 'cats', slot: 0, sounds: CAT },
  cat_tan: { species: 'cat', sheet: 'cats', slot: 1, sounds: CAT },
  cat_ginger: { species: 'cat', sheet: 'cats', slot: 2, sounds: CAT },
  cat_black: { species: 'cat', sheet: 'cats', slot: 3, sounds: CAT },
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

/** The source rectangle of a pet's frame in its sheet. Rows: right, up, down, left; a walk takes columns 0-2 and the lying frame is column 3. */
export function petFrame(kind: PetKind, pose: PetPose, dir: Direction): { x: number; y: number; w: number; h: number } {
  const row = { right: 0, up: 1, down: 2, left: 3 }[dir];
  // Lying is only drawn side-on: face left or right.
  const lyingRow = dir === 'left' ? 3 : 0;
  const col = pose === 'lie' ? 3 : 0;
  return {
    x: (kind.slot * 4 + col) * PET_FRAME,
    y: (pose === 'lie' ? lyingRow : row) * PET_FRAME,
    w: PET_FRAME,
    h: PET_FRAME,
  };
}
