// The training grounds: a walled stone yard (an indoor zone, so players arrive through the iris) with a doormat at the bottom
// that leads back to the trainer's room, and a wave of enemies that do not come back (systems/skills.ts). The two grounds
// (maps/training_novice.ts, maps/training_adept.ts) differ in size and in who waits there.

import { TRAINER_RETURN, TRAINER_ROOM } from '../../src/systems/skills';
import type { ZoneApi } from './zone';

/**
 * Build a yard `width` x `height` cells: wall round the edge, flagstone inside, the way out (a doormat) at the bottom
 * middle, and a few barrels to dodge round. The player arrives just above the mat. Returns where they arrive, so a
 * spec can keep its enemies away from it.
 */
export function trainingYard(z: ZoneApi, cover: [number, number][]): { col: number; row: number } {
  const { width: w, height: h } = z;
  z.indoor();
  z.fill('flagstone');
  z.fill('wall', { col: 0, row: 0, w, h: 2 });
  z.fill('wall', { col: 0, row: 2, w: 1, h: h - 2 });
  z.fill('wall', { col: w - 1, row: 2, w: 1, h: h - 2 });
  z.fill('wall', { col: 0, row: h - 1, w, h: 1 });
  z.block({ col: 0, row: 0, w, h: 2 }, 'wall');
  z.block({ col: 0, row: 2, w: 1, h: h - 2 }, 'wall');
  z.block({ col: w - 1, row: 2, w: 1, h: h - 2 }, 'wall');
  z.block({ col: 0, row: h - 1, w, h: 1 }, 'wall');
  for (const [col, row] of cover) z.prop('barrel', col, row);

  const mid = Math.floor(w / 2) - 1;
  z.fill('mat', { col: mid, row: h - 1, w: 2, h: 1 });
  z.door(mid, h - 1, 2, TRAINER_ROOM, TRAINER_RETURN.col, TRAINER_RETURN.row);
  const spawn = { col: mid, row: h - 3 };
  z.spawn(spawn.col, spawn.row);
  return spawn;
}
