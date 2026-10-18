// The host's (or solo's) side of ledge drops (core engine, capability `ledges`; the rule and its numbers are
// `systems/ledgeDrop.ts`): watching a hero push south into a plateau's face, starting the hop, and moving the hero along it.
// The scene's `Simulation.updatePlayer` only calls these. A guest sends its walking keys as always and draws `FLAG.hop`.

import { DIR_VEC } from '../../core/direction';
import type { Command, Player } from '../../entities/Player';
import { enabled } from '../../systems/capabilities';
import { DROP_CONFIRM_S, HOP_GRACE, dropHold, dropTarget, startHop, stepHop } from '../../systems/ledgeDrop';
import type { Arena } from './Arena';

/**
 * After a walking tick: has this hero pushed south into the face of a ledge long enough? `before` is where their feet were
 * before the tick (a hero who still moved is not pushing into anything). Starts the hop when so. The one gate of `ledges`.
 */
export function watchLedge(arena: Arena, p: Player, cmd: Command, beforeY: number, dt: number) {
  const { zone, collision } = arena;
  const stunned = p.hitstop > 0 || p.knock.x !== 0 || p.knock.y !== 0 || p.roll !== null;
  if (!enabled('ledges', zone.name) || stunned || p.down !== null || p.dm) {
    p.dropHold = 0;
    return;
  }
  p.dropHold = dropHold(p.dropHold, cmd.dy > 0 && p.body.y === beforeY, dt);
  if (p.dropHold < DROP_CONFIRM_S) return;
  const to = dropTarget(zone.data.ledges, p.body.x, p.body.y, (x, y) => collision.fitsMap(x, y, p.body.size));
  p.dropHold = 0;
  if (!to) return;
  p.hop = startHop(p.body, to);
  p.grace = Math.max(p.grace, HOP_GRACE);
  p.vel = { x: 0, y: 0 };
  p.swing = null;
  p.pendingShot = null;
  p.drinking = null;
  p.body.cancelAction();
  p.body.release();
  p.body.face('down');
}

/** One tick of a hop: the feet follow the straight ground path (no collision), facing stays the player's. True while still in the air or just landing. */
export function hopTick(p: Player, cmd: Command, dt: number): boolean {
  const h = p.hop;
  if (!h) return false;
  const now = stepHop(h, dt);
  p.body.position.set(now.x, now.y);
  if (cmd.dx) p.body.face(cmd.dx > 0 ? 'right' : 'left');
  else if (cmd.dy) p.body.face(cmd.dy > 0 ? 'down' : 'up');
  const [fx, fy] = DIR_VEC[p.body.facing];
  p.aim = { x: fx, y: fy };
  if (now.done) p.hop = null;
  keepBuffers(p);
  return false;
}

/** A sword press or roll pressed mid-hop waits for the landing: refresh whatever is pending so its short window does not run out in the air. */
export function keepBuffers(p: Player) {
  if (p.attackBuffer.pending) p.attackBuffer.press(p.zone);
  if (p.rollBuffer.pending) p.rollBuffer.press(p.zone);
}
