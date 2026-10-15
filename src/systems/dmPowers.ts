// What the Dungeon Master can do with one tap (Pixi-free, tested; core engine, co-op): speak to the party, smite every
// foe where they stand with a storm of lightning, or hold them all still. Each has a cooldown so it stays special.

/** Seconds before the DM may smite / freeze again. */
export const SMITE_COOLDOWN = 45;
export const FREEZE_COOLDOWN = 25;
/** Seconds the foes stay held. */
export const FREEZE_TIME = 10;
/** The longest thing a DM may say, and how long it stays on the players' screens (seconds). */
export const MAX_SAY = 120;
export const SAY_SHOW = 8;

/** The DM's words as they will be sent: trimmed, one line, no longer than `MAX_SAY` ('' when there is nothing to say). */
export function cleanSay(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_SAY).trim();
}

/** One bolt of a smite: when it lands (seconds from the tap), where, its shape seed, and the foe it kills (an index). */
export interface Bolt {
  at: number;
  x: number;
  y: number;
  seed: number;
  kill: number | null;
}

/** The whole storm lasts about this long, however many foes there are. */
const STORM = 2.4;
const MAX_GAP = 0.3;
/** Bolts that only crack across the sky before the foes fall, for show. */
const OPENERS = 3;

/**
 * The bolts of a smite on foes standing at `foes`: a few for show round the middle of them, then one on each foe, spread
 * over the storm so it rolls across rather than landing at once. `rand` gives numbers in [0, 1).
 */
export function smitePlan(foes: { x: number; y: number }[], rand: () => number): Bolt[] {
  if (!foes.length) return [];
  const mid = foes.reduce((m, f) => ({ x: m.x + f.x / foes.length, y: m.y + f.y / foes.length }), { x: 0, y: 0 });
  const seed = () => Math.floor(rand() * 1e9);
  const bolts: Bolt[] = [];
  for (let i = 0; i < OPENERS; i++)
    bolts.push({
      at: i * 0.15,
      x: mid.x + (rand() - 0.5) * 520,
      y: mid.y + (rand() - 0.5) * 360,
      seed: seed(),
      kill: null,
    });
  const start = OPENERS * 0.15 + 0.2;
  const gap = Math.min(MAX_GAP, (STORM - start) / foes.length);
  // the nearest to the middle first, so the storm spreads outward
  const order = foes
    .map((f, kill) => ({ f, kill, d: Math.hypot(f.x - mid.x, f.y - mid.y) }))
    .sort((a, b) => a.d - b.d || a.kill - b.kill);
  order.forEach(({ f, kill }, i) => bolts.push({ at: start + i * gap, x: f.x, y: f.y, seed: seed(), kill }));
  return bolts;
}

/** A power that can be used again once its cooldown has run out. */
export class Cooldown {
  private left = 0;
  constructor(readonly length: number) {}

  get ready(): boolean {
    return this.left <= 0;
  }

  /** Seconds still to wait, rounded up. */
  get wait(): number {
    return Math.ceil(this.left);
  }

  /** Start the cooldown; false (and nothing changes) if it was still running. */
  use(): boolean {
    if (!this.ready) return false;
    this.left = this.length;
    return true;
  }

  tick(dt: number) {
    this.left = Math.max(0, this.left - dt);
  }

  reset() {
    this.left = 0;
  }
}
