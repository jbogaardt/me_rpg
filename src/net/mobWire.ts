// A mob on the wire: the host's `MobView` flattened to the tuple a snapshot carries, and back. Pure.

import { DIRS, dirIndex } from '../core/direction';
import { MOB_STATES, type MobView } from '../systems/combat';
import type { MobFields } from './protocol';

/**
 * The tuple for one mob. Positions are whole pixels (a guest glides between snapshots, and the screen rounds anyway).
 * The timer drives only the windup telegraph, the recovery lunge and the respawn fade, so it is sent in those states and
 * is 0 otherwise: that way a mob standing still has a state that does not change, and the host can leave it out of most
 * snapshots (see feed.ts).
 */
export function encodeMob(v: MobView): MobFields {
  const timed = v.state === 'windup' || v.state === 'recover' || v.state === 'dead';
  return [
    Math.round(v.x),
    Math.round(v.y),
    dirIndex(v.facing),
    MOB_STATES.indexOf(v.state),
    v.hp,
    timed ? Math.max(0, Math.round(v.timer * 1000)) : 0,
    v.moving ? 1 : 0,
  ];
}

export function decodeMob([x, y, dir, state, hp, timer, moving]: MobFields): MobView {
  return {
    x,
    y,
    facing: DIRS[dir] ?? 'down',
    state: MOB_STATES[state] ?? 'idle',
    hp,
    timer: timer / 1000,
    moving: moving === 1,
  };
}
