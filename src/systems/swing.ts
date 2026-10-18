// The phases of a melee swing (core engine rule, Pixi-free; the host or solo simulates it, a guest only draws).
//
// A press starts the body swinging at once (STARTUP), the blow resolves on the tick the blade visibly extends (the
// CONTACT tick: damage, arc, spark, hit-stop) and the rest of the cooldown is recovery. The hit check runs at contact
// with the foes where they stand THEN, so a foe that walks out of reach during startup is missed and one that steps in
// is hit. One swing has one contact tick, so a foe is hit at most once per swing (`hit` records who, so a longer active
// window could be added without a double hit).
//
// Numbers (measured from the `slash` row of the sheet, the arming sword and dagger layers, 6 frames of 128 px): the
// blade is raised over frames 0-2, starts to sweep on 3 (tip 30 px out) and is fully out at frame 4 (tip 48 px out, the
// reach of the hit circle) with frame 5 the follow-through. So frame 4 is the strike frame. Playing the row uniformly
// puts frame 4 at 4/6 of its length, so the body animation is sped up until frame 4 starts at STARTUP: 90 ms, which
// is the 6th tick at 60 Hz, instead of 220 ms. The total cooldown (and so the DPS) is not touched.

import { DIR_VEC, type Direction } from '../core/direction';

export interface SwingTimeline {
  /** Seconds from the press to contact. */
  startup: number;
  /** The step of the animation's cycle where the blade is fully out: it starts playing at `startup`. */
  strikeStep: number;
}

/** A sword (the weapons that swing; bows, wands and tomes have their own timing). */
export const SWORD_SWING: SwingTimeline = { startup: 0.09, strikeStep: 4 };

/** How far in front of the hero the hit circle is centred, in pixels (the same as `meleeAssist`'s SWING_OFFSET). */
export const HIT_OFFSET = 16;

/** Playback length in ms of an animation of `steps` steps so that step `strikeStep` starts `startup` seconds in. */
export function swingAnimMs(t: SwingTimeline, steps: number): number {
  return (t.startup * 1000 * steps) / t.strikeStep;
}

/** A swing between the press and its contact. */
export interface PendingSwing {
  /** Seconds left until contact. */
  timer: number;
  /** The zone it was started in: a hero who has left it by contact (a door, a fall) swings at nothing. */
  zone: string;
  /** The foes already hit by this swing. */
  hit: Set<unknown>;
}

export function startSwing(t: SwingTimeline, zone: string): PendingSwing {
  return { timer: t.startup, zone, hit: new Set() };
}

/** Advance a swing; true on the tick it reaches contact (and never again: the caller drops it then). */
export function stepSwing(s: PendingSwing, dt: number): boolean {
  s.timer -= dt;
  return s.timer <= 0;
}

export interface Target {
  x: number;
  y: number;
  /** Extra hit radius of a big body. */
  allowance: number;
}

/** The targets a swing from (x, y) facing `dir` hits now: inside the circle ahead of the hero, and not hit already. */
export function contactHits<T extends Target>(
  x: number,
  y: number,
  dir: Direction,
  targets: readonly T[],
  reach: number,
  hit: Set<unknown> = new Set(),
): T[] {
  const [vx, vy] = DIR_VEC[dir];
  const cx = x + vx * HIT_OFFSET;
  const cy = y + vy * HIT_OFFSET;
  const struck: T[] = [];
  for (const t of targets) {
    if (hit.has(t) || Math.hypot(t.x - cx, t.y - cy) >= reach + t.allowance) continue;
    hit.add(t);
    struck.push(t);
  }
  return struck;
}
