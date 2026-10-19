// Where a unit is DRAWN (cosmetic; the rules keep every unit on the road's centre line). A group bought together walks out on the
// same spot, so each unit is shifted a little across the road by its id (consecutive ids take different lanes), and the crowd reads
// as a crowd. A unit off the road (stepping out to a tower) is drawn where it is.

import type { Board } from './sim/board';
import { unitPos, type Unit } from './sim/sim';

/** Lane (in lane widths from the middle) of a unit by its id: 0, -1, 1, -2, 2, then round again. */
const LANES = [0, -1, 1, -2, 2];
/** How far apart (cells) neighbouring lanes are, across the road. */
export const LANE_WIDTH = 0.4;

/** How far across the road (cells, to the road's right of its direction) a unit is drawn from its centre line. */
export const laneOf = (id: number): number => LANES[id % LANES.length]! * LANE_WIDTH;

export function drawnPos(u: Pick<Unit, 'id' | 'owner' | 's' | 'off'>, board: Board): [number, number] {
  const [x, y] = unitPos(u, board);
  if (u.off) return [x, y];
  const [dx, dy] = board.directionAt(u.owner === 0 ? u.s : board.roadLength - u.s);
  const lane = laneOf(u.id);
  return [x - dy * lane, y + dx * lane];
}
