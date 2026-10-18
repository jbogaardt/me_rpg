// Ledge drops (core engine, capability `ledges`, Pixi-free, host-owned): a hero who stands on a plateau ledge's edge row
// and keeps walking south into the rock face hops down to the landing row (`map/ledges.ts` says where). The host or solo
// simulates it (`scenes/overworld/Ledges.ts`); a guest sends only its walking keys and draws `FLAG.hop`.
//
// Feel: the press is confirmed after DROP_CONFIRM_S of pushing into the face (a brush does not drop you), then the hero
// follows a fixed HOP_TIME arc to the landing: the ground path is a straight line to the landing, the body is lifted
// HOP_LIFT px at the peak, nothing collides on the way (rock face and bodies are ignored) and a silent grace (`Player.grace`)
// covers the hop and a moment after. Facing stays the player's, an attack or roll pressed mid-hop is kept and fires at the
// landing (`Ledges.keepBuffers`). The landing is a squash, a puff of dust and a thud, no hit-pause and NO fall damage. Nothing
// brings a hero back up this way: the face stays blocked, the stairs are the way up. Mobs do not drop.

import type { LedgeSpawn } from '../map/types';
import { ledgeAt, landingOf } from '../map/ledges';

/** Seconds of pushing south into the face before the drop starts (a brush against it does not drop you). */
export const DROP_CONFIRM_S = 0.1;
/** Seconds the hop lasts, take-off to landing. */
export const HOP_TIME = 0.4;
/** Pixels the body is lifted at the top of the arc (cosmetic; the feet's position is the straight ground path). */
export const HOP_LIFT = 22;
/** Silent immunity: the hop plus a moment after it (nothing hits a hero in the air or just landed). */
export const HOP_GRACE = HOP_TIME + 0.12;
/** Seconds the landing squash takes to recover. */
export const LAND_SQUASH_S = 0.16;

export interface HopState {
  /** Seconds into the hop. */
  t: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** The hold timer after one tick: it grows while the hero pushes south into the face, and starts over the moment they stop. */
export const dropHold = (held: number, pushing: boolean, dt: number): number => (pushing ? held + dt : 0);

/**
 * Where a hero at (x, y) would drop to, or undefined: only from a ledge's edge row, and only when the landing fits the map
 * (`fits`), so a drop either happens completely or not at all. The feet may sit a pixel into the face row (the collision
 * box ends at y - 1), hence y - 1.
 */
export function dropTarget(
  ledges: readonly LedgeSpawn[] | undefined,
  x: number,
  y: number,
  fits: (x: number, y: number) => boolean,
): { x: number; y: number } | undefined {
  const ledge = ledgeAt(ledges, x, y - 1);
  if (!ledge) return undefined;
  const to = landingOf(ledge, x);
  return fits(to.x, to.y) ? to : undefined;
}

export const startHop = (from: { x: number; y: number }, to: { x: number; y: number }): HopState => ({
  t: 0,
  from: { x: from.x, y: from.y },
  to,
});

/** Advance by `dt`: where the feet are now (along the straight ground path) and whether the hop is over (feet exactly at the landing). */
export function stepHop(h: HopState, dt: number): { x: number; y: number; done: boolean } {
  h.t += dt;
  const u = Math.min(1, h.t / HOP_TIME);
  return { x: h.from.x + (h.to.x - h.from.x) * u, y: h.from.y + (h.to.y - h.from.y) * u, done: u >= 1 };
}

/** How high the body is lifted `t` seconds into the hop: a parabola, 0 at both ends. */
export function hopLift(t: number): number {
  const u = Math.min(1, Math.max(0, t / HOP_TIME));
  return 4 * HOP_LIFT * u * (1 - u);
}

/** The body's squash: a slight stretch in the air, a flatter landing that recovers over LAND_SQUASH_S (`since`: seconds after landing). */
export function hopSquash(t: number, since: number): { sx: number; sy: number } {
  if (since >= 0) {
    const k = Math.max(0, 1 - since / LAND_SQUASH_S);
    return { sx: 1 + 0.14 * k, sy: 1 - 0.22 * k };
  }
  const u = Math.min(1, Math.max(0, t / HOP_TIME));
  const stretch = Math.sin(Math.PI * u);
  return { sx: 1 - 0.05 * stretch, sy: 1 + 0.08 * stretch };
}
