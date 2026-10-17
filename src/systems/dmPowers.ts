// What the Dungeon Master can do with one tap (Pixi-free, tested; core engine, co-op): speak to the party, smite every
// foe where they stand with a storm of lightning, or hold them all still. Each has a cooldown so it stays special.

/** The DM is never made to wait: their powers have no cooldown (a storm in flight is the only thing a second Smite waits for). */
export const SMITE_COOLDOWN = 0;
export const FREEZE_COOLDOWN = 0;
export const RESET_COOLDOWN = 0;

/**
 * How hard the world pushes back: the one dial of intensity the Dungeon Master has. A foe's blows land `factor` times
 * as hard and the party's blows count `1 / factor` times as much, so "fierce" is both tougher and deadlier, and
 * "gentle" lets a weak party breathe. The host alone applies it (Simulation); friends only see the result.
 */
export const PRESSURES = ['gentle', 'steady', 'fierce'] as const;
export type Pressure = (typeof PRESSURES)[number];
export const PRESSURE_FACTOR: Record<Pressure, number> = { gentle: 0.7, steady: 1, fierce: 1.5 };
export const PRESSURE_LABEL: Record<Pressure, string> = { gentle: 'Ease off', steady: 'Steady', fierce: 'Turn it up' };
export const isPressure = (v: unknown): v is Pressure => (PRESSURES as readonly unknown[]).includes(v);
/** Seconds the foes stay held. */
export const FREEZE_TIME = 10;
/** The longest thing a DM may say, and how long it stays on the players' screens (seconds). */
export const MAX_SAY = 360;
export const SAY_SHOW = 8;

/** Seconds a line of the DM's words stays up: long enough to read it, never less than `SAY_SHOW`. */
export const sayTime = (text: string): number => Math.min(30, Math.max(SAY_SHOW, 4 + text.length / 14));

/**
 * `text` (one line) cut to at most `max` letters where a reader will not notice: after the last whole sentence that fits
 * (if that keeps at least a third of it), else at the last word with an ellipsis. Never mid-word or mid-sentence.
 */
export function fitWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  const ends = /[.!?]["')\]]?$/.test(head) ? head.length : stop + 1; // the cut may fall just after a full stop
  if (ends >= max / 3) return head.slice(0, ends).trim();
  const space = head.lastIndexOf(' ', max - 1);
  return `${head.slice(0, space > 0 ? space : max - 1).replace(/[\s,;:—-]+$/, '')}…`.slice(0, max);
}

/** The DM's words as they will be sent: trimmed, one line, cut to a whole sentence if over `MAX_SAY` ('' when there is nothing to say). */
export function cleanSay(text: string): string {
  return fitWords(text.replace(/\s+/g, ' ').trim(), MAX_SAY).trim();
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
