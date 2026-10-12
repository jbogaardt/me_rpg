// Signposts at the forks of the roads: each names where its ways lead. Pure; the maps place them (`z.sign`, MapData.signs),
// the overworld scene opens the dialog when the action key is pressed beside one (OverworldScene.handleAction). They are
// read locally, so nothing goes over the wire in co-op: every player has the same map.

import { directionToward, type Direction } from '../core/direction';
import { zoneName } from './places';

/** Where each way of a signpost leads: a zone key (named by ZONE_NAMES) or the name of a place on the same map. */
export type SignWays = Partial<Record<Direction, string>>;

/** The order the ways are read in: north first, then west, east and south. */
export const SIGN_ORDER: readonly Direction[] = ['up', 'left', 'right', 'down'];

const ARROWS: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** What a signpost says: one page, a line per way with its arrow. */
export function signLines(ways: SignWays): string[] {
  const lines = SIGN_ORDER.flatMap((d) => {
    const to = ways[d];
    return to ? [`${ARROWS[d]} ${zoneName(to)}`] : [];
  });
  return [lines.join('\n')];
}

/**
 * The signpost a player at (x, y) facing `facing` reads: within `reach` px of its foot (cell `col,row`) and in front of
 * them, so a sign by the road never takes the action key from a swing at something else. The nearest wins.
 */
export function signNear<T extends { col: number; row: number }>(
  signs: readonly T[],
  x: number,
  y: number,
  facing: Direction,
  reach: number,
  cell = 32,
): T | undefined {
  let best: T | undefined;
  let bestD = reach;
  for (const s of signs) {
    const [dx, dy] = [(s.col + 0.5) * cell - x, (s.row + 0.5) * cell - y];
    const d = Math.hypot(dx, dy);
    if (d < bestD && directionToward(dx, dy) === facing) [best, bestD] = [s, d];
  }
  return best;
}
