// The dodge roll (core engine, Pixi-free, no capability: the hero's one defensive verb, like walking). The host or solo
// simulates it (`Simulation.rollTick`); a guest only sends the wish (the toggle bit `KEY.roll`, `net/protocol.ts`) and draws
// the `FLAG.roll` bit the host sets.
//
// The move: a fast dash of ROLL_DISTANCE in ROLL_TIME, eased out (the burst is at the start, like a real dive) in the
// direction of the walk keys, else the aim, else the facing. Invulnerable only over the middle (frames 2 to 7 of the 13
// the roll lasts at 60 Hz). The window lives in the roll's own timer and `Player.safe` reads it, so nothing outlives the
// roll: a roll can never grant more than ROLL_IFRAMES of safety, however it ends (a hit, a door, a fall). A cooldown of
// ROLL_COOLDOWN runs from the START of the roll, so it can't be chained; the press is buffered (`inputBuffer.ts`'s
// AttackBuffer, the same 0.16 s) so a press just before it is legal fires the moment it is. No damage is dealt and nothing
// else is spent. Stun and knock win over a roll: it cannot start in them and a blow that lands outside the window ends it.

/** Seconds a roll lasts (13 frames at 60 Hz). */
export const ROLL_TIME = 13 / 60;
/** Pixels travelled, 3 cells. */
export const ROLL_DISTANCE = 96;
/** Seconds from the start of one roll to the next being allowed. */
export const ROLL_COOLDOWN = 0.6;
/** The window of invulnerability, in seconds into the roll: frames 2 to 7 at 60 Hz (six ticks, 100 ms). */
export const ROLL_IFRAMES = { from: 2 / 60, to: 8 / 60 } as const;
/** Longest step handed to the collision at once (px), so a long frame never tunnels through a wall. */
export const ROLL_SUBSTEP = 6;

export interface RollState {
  /** Seconds into the roll. */
  t: number;
  /** Unit direction. */
  x: number;
  y: number;
}

/** Fraction of the distance covered after `t` seconds: ease-out (fast first, slowing as the hero lands). */
export function rollProgress(t: number): number {
  const u = Math.min(1, Math.max(0, t / ROLL_TIME));
  return 1 - (1 - u) * (1 - u);
}

/**
 * Which way to roll: the walk keys if any are held, else the aim (the way last walked, or the mouse), else the facing.
 * Returns a unit vector.
 */
export function rollDirection(
  dx: number,
  dy: number,
  aim: { x: number; y: number },
  facing: readonly [number, number],
): { x: number; y: number } {
  for (const [x, y] of [
    [dx, dy],
    [aim.x, aim.y],
    [facing[0], facing[1]],
  ] as const) {
    const len = Math.hypot(x, y);
    if (len > 1e-6) return { x: x / len, y: y / len };
  }
  return { x: 0, y: 1 };
}

export function startRoll(x: number, y: number): RollState {
  return { t: 0, x, y };
}

/** Is the roll inside its window of invulnerability? */
export function rollInvulnerable(r: RollState | null): boolean {
  return r !== null && r.t >= ROLL_IFRAMES.from && r.t < ROLL_IFRAMES.to;
}

/**
 * Advance a roll by `dt`: the offset to move this tick (the caller slides the body by it, in `ROLL_SUBSTEP` pieces) and
 * whether the roll is over. Always sums to ROLL_DISTANCE over a whole roll, however the ticks fall.
 */
export function stepRoll(r: RollState, dt: number): { mx: number; my: number; done: boolean } {
  const before = rollProgress(r.t);
  r.t += dt;
  const d = (rollProgress(r.t) - before) * ROLL_DISTANCE;
  return { mx: r.x * d, my: r.y * d, done: r.t >= ROLL_TIME };
}

/**
 * One tick of a roll: advance it and hand the movement to `slide` in pieces of at most ROLL_SUBSTEP px (the caller's
 * `Collision.slide`), so a long frame never steps through a wall and a wall is slid along as when walking. True when the roll
 * is over.
 */
export function moveRoll(r: RollState, dt: number, slide: (mx: number, my: number) => void): boolean {
  const { mx, my, done } = stepRoll(r, dt);
  const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / ROLL_SUBSTEP));
  for (let i = 0; i < n; i++) slide(mx / n, my / n);
  return done;
}

/** What may stop a roll starting. */
export interface RollGate {
  cooldown: number;
  rolling: boolean;
  down: boolean;
  /** Hit-stun or hit-pause on the hero (a blow taken), or being knocked back. */
  stunned: boolean;
  dm: boolean;
}

/** May a roll start now? (Pressed while not legal it waits in the buffer instead.) */
export function canRoll(g: RollGate): boolean {
  return g.cooldown <= 0 && !g.rolling && !g.down && !g.stunned && !g.dm;
}

/**
 * The body's shape over a roll, for the look (squash, lean and a spin of the existing sprite; no roll art exists):
 * `spin` is radians turned so far (one full turn), the stretch is along the way it goes, flattening as it gets going.
 */
export function rollPose(t: number): { sx: number; sy: number; spin: number; lift: number } {
  const u = Math.min(1, Math.max(0, t / ROLL_TIME));
  const squash = Math.sin(Math.PI * u); // 0 at both ends, most in the middle
  return { sx: 1 + 0.12 * squash, sy: 1 - 0.28 * squash, spin: Math.PI * 2 * rollProgress(t), lift: 6 * squash };
}

/** The share of the cooldown still to run, 0 (ready) to 1 (just rolled): what the hero's ring shows. */
export function cooldownShare(cooldown: number): number {
  return Math.min(1, Math.max(0, cooldown / ROLL_COOLDOWN));
}
