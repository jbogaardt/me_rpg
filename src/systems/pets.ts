// Town pets (Pixi-free, tested): the dogs and cats that doze around the zones. They are not enemies and have no stats:
// the action key next to one makes it answer in its own language. Art: public/sprites/pets/{dogs,cats}.png.

import { directionToward, type Direction } from '../core/direction';

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
  /** How fast it walks, in pixels per second. */
  speed: number;
  /** What it says when spoken to, in turn. */
  sounds: string[];
}

const QUAD = { right: 0, up: 1, down: 2, left: 3 } as const;
const DOG = ['Woof!', 'Woof woof!', 'Arf!', 'Ruff ruff!'];
const CAT = ['Meow!', 'Meow meow?', 'Mrrrow!', 'Purrrr...'];
const RAT = ['Squeak!', 'Squeak squeak!', 'Eek!', 'Squeee!'];
const CRITTER = { rows: QUAD, lies: true, idleFrames: 1, cols: 4 };
const DOG_SPEED = 42;
const CAT_SPEED = 34;

export const PET_KINDS: Record<string, PetKind> = {
  dog_white: { species: 'dog', sheet: 'dogs', ...CRITTER, speed: DOG_SPEED, slot: 0, sounds: DOG },
  dog_brown: { species: 'dog', sheet: 'dogs', ...CRITTER, speed: DOG_SPEED, slot: 1, sounds: DOG },
  dog_tan: { species: 'dog', sheet: 'dogs', ...CRITTER, speed: DOG_SPEED, slot: 2, sounds: DOG },
  dog_black: { species: 'dog', sheet: 'dogs', ...CRITTER, speed: DOG_SPEED, slot: 3, sounds: DOG },
  cat_white: { species: 'cat', sheet: 'cats', ...CRITTER, speed: CAT_SPEED, slot: 0, sounds: CAT },
  cat_tan: { species: 'cat', sheet: 'cats', ...CRITTER, speed: CAT_SPEED, slot: 1, sounds: CAT },
  cat_ginger: { species: 'cat', sheet: 'cats', ...CRITTER, speed: CAT_SPEED, slot: 2, sounds: CAT },
  cat_black: { species: 'cat', sheet: 'cats', ...CRITTER, speed: CAT_SPEED, slot: 3, sounds: CAT },
  rat: {
    species: 'rat',
    sheet: 'rat',
    slot: 0,
    rows: { down: 0, left: 1, right: 2, up: 3 },
    lies: false,
    idleFrames: 3,
    cols: 3,
    speed: 52,
    sounds: RAT,
  },
};

/** What a pet says the `n`th time it is spoken to (cycles through its sounds). */
export function petSound(kind: PetKind, n: number): string {
  const sounds = kind.sounds;
  return sounds[((n % sounds.length) + sounds.length) % sounds.length] ?? '...';
}

export type PetPose = 'stand' | 'walk' | 'lie';

/** How far a pet strays from where it was placed, in pixels (5 cells). */
export const LEASH = 160;
/** How long a pet stays up and facing you after being spoken to, in seconds. */
export const ATTEND = 4;
const WALK_CYCLE = [0, 1, 2, 1]; // the order of the three walk frames

/**
 * What a pet does (Pixi-free, tested): it stands about, now and then lies down (if it can) or ambles to a spot within
 * `LEASH` of its home, then rests again. `free(x, y)` says whether it may stand there (the zone's collision), and every step
 * is checked, so it never leaves open ground. `rng` gives 0..1 (pass a seeded one in tests).
 */
export class PetBrain {
  x: number;
  y: number;
  dir: Direction;
  pose: PetPose = 'stand';
  /** Seconds walked so far, which picks the walk frame. */
  walked = 0;
  private timer: number;
  private target = { x: 0, y: 0 };

  constructor(
    private kind: PetKind,
    private home: { x: number; y: number },
    private free: (x: number, y: number) => boolean,
    private rng: () => number = Math.random,
  ) {
    this.x = home.x;
    this.y = home.y;
    this.dir = this.rng() < 0.5 ? 'left' : 'right';
    this.timer = 0.5 + this.rng() * 4; // neighbours do not all set off together
  }

  /** The walk frame to draw now (0-2). */
  get step(): number {
    return WALK_CYCLE[Math.floor(this.walked * 7) % WALK_CYCLE.length] ?? 0;
  }

  /** Spoken to: stop, stand and face (x, y) for a few seconds. */
  attend(x: number, y: number) {
    const d = directionToward(x - this.x, y - this.y);
    this.dir = d;
    this.pose = 'stand';
    this.timer = ATTEND;
  }

  update(dt: number) {
    if (this.pose === 'walk') return this.walk(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    const roll = this.rng();
    if (this.pose === 'lie') {
      this.pose = 'stand';
      this.timer = 1 + this.rng() * 3;
    } else if (this.kind.lies && roll < 0.3) {
      this.pose = 'lie';
      this.timer = 8 + this.rng() * 10;
      if (this.dir === 'up' || this.dir === 'down') this.dir = this.rng() < 0.5 ? 'left' : 'right';
    } else if (this.pickTarget()) {
      this.pose = 'walk';
      this.walked = 0;
    } else {
      this.timer = 1 + this.rng() * 2;
    }
  }

  /** Choose somewhere to amble to: a free spot within the leash of home that is not right where it already is. */
  private pickTarget(): boolean {
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 24 + this.rng() * (LEASH - 24);
      const x = this.home.x + Math.cos(a) * r;
      const y = this.home.y + Math.sin(a) * r * 0.7;
      if (Math.hypot(x - this.x, y - this.y) > 24 && this.free(x, y)) {
        this.target = { x, y };
        return true;
      }
    }
    return false;
  }

  private walk(dt: number) {
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const stride = Math.min(dist, this.kind.speed * dt);
    const nx = this.x + (dx / dist) * stride;
    const ny = this.y + (dy / dist) * stride;
    this.walked += dt;
    if (dist < 1 || !this.free(nx, ny)) return this.rest();
    this.x = nx;
    this.y = ny;
    this.dir = directionToward(dx, dy);
    if (stride >= dist) this.rest();
  }

  private rest() {
    this.pose = 'stand';
    this.timer = 2 + this.rng() * 6;
  }
}

/**
 * The source rectangle of a pet's frame in its sheet. A walk takes columns 0-2 and a lying frame is column 3 (side-on:
 * only left or right); `step` picks the walk frame, or the standing frame of a pet that cycles them (`idleFrames`).
 */
export function petFrame(
  kind: PetKind,
  pose: PetPose,
  dir: Direction,
  step = 0,
): { x: number; y: number; w: number; h: number } {
  const lying = pose === 'lie' && kind.lies;
  const row = kind.rows[lying && dir !== 'left' ? 'right' : dir];
  const col = lying
    ? 3
    : pose === 'walk'
      ? Math.abs(step) % 3
      : ((step % kind.idleFrames) + kind.idleFrames) % kind.idleFrames;
  return { x: (kind.slot * kind.cols + col) * PET_FRAME, y: row * PET_FRAME, w: PET_FRAME, h: PET_FRAME };
}
