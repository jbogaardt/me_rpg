// Melee aim assist (core engine rule, Pixi-free). A sword swing hits a circle just in front of the hero in one of four
// facings, and the facing is the way they last walked. A thumb on the touch pad (or a diagonal run at a moving mob)
// leaves the hero looking a little off the foe, so the swing whiffs. Before a swing the host turns the hero toward the
// nearest foe that the current facing would miss, if one is close enough. A foe the facing already hits is left alone,
// so keyboard play only changes when it would have missed. The host owns it (it runs inside `Simulation.attack`), so a
// guest gets the same help and nothing new goes on the wire.

import { DIR_VEC, directionToward, type Direction } from '../core/direction';

/** How far in front of the hero the swing's hit circle is centred, in pixels. */
export const SWING_OFFSET = 16;
/** How far from the hero a foe may stand and still be turned toward (centre to centre, plus its size allowance). */
export const ASSIST_RANGE = 44;

export interface Foe {
  x: number;
  y: number;
  /** Extra hit radius of a big body (the same allowance the swing uses). */
  allowance: number;
}

/** Would a swing facing `dir` from (x, y) land on this foe? */
export function swingHits(x: number, y: number, dir: Direction, foe: Foe, reach: number): boolean {
  const [vx, vy] = DIR_VEC[dir];
  return Math.hypot(foe.x - (x + vx * SWING_OFFSET), foe.y - (y + vy * SWING_OFFSET)) < reach + foe.allowance;
}

/**
 * The facing to swing in: `facing` itself when it already hits a foe (or none is near), otherwise the way toward the
 * nearest foe within `ASSIST_RANGE`.
 */
export function assistFacing(x: number, y: number, facing: Direction, foes: readonly Foe[], reach: number): Direction {
  let nearest: Foe | undefined;
  let best = Infinity;
  for (const foe of foes) {
    if (swingHits(x, y, facing, foe, reach)) return facing;
    const d = Math.hypot(foe.x - x, foe.y - y);
    if (d < ASSIST_RANGE + foe.allowance && d < best) {
      best = d;
      nearest = foe;
    }
  }
  if (!nearest) return facing;
  const dir = directionToward(nearest.x - x, nearest.y - y);
  return swingHits(x, y, dir, nearest, reach) ? dir : facing;
}
