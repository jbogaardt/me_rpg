// Signposts at the forks of the roads: each names where its ways lead. Pure; the maps place them (`z.sign`, MapData.signs),
// the overworld scene opens the dialog when the action key is pressed beside one (Interactions.handleAction). Core engine.
//
// What a sign says is worked out when it is READ, from the world as it is: a map is built once but sits among different
// neighbours in a random, live or other campaign, so its authored `ways` are only a hint. A way naming a place of this
// map is kept; any other is a zone, and the sign names the zone actually reached by leaving the map that way (the gap
// doors of the loaded, port-wired map: `Zones.rewire` has already opened the ports the content binds and left the rest
// sealed), or loses the line when nothing lies that way. A live world's Dungeon Master may rewrite a sign outright
// (`World` log entry `sign`); that override wins over the computed text. Local to each page: nothing on the wire but the log.

import type { Direction } from '../core/direction';
import type { MapData } from '../map/types';
import { SIGN_NOWHERE_WORDS } from './dmVoice';
import { zoneName } from './places';

/** Where each way of a signpost leads: a zone key (named by ZONE_NAMES) or the name of a place on the same map. */
export type SignWays = Partial<Record<Direction, string>>;

/** The order the ways are read in: north first, then west, east and south. */
export const SIGN_ORDER: readonly Direction[] = ['up', 'left', 'right', 'down'];

const ARROWS: Record<Direction, string> = { up: '↑ North', down: '↓ South', left: '← West', right: '→ East' };

/** The part of a loaded map the ways are read against. */
export type SignMap = Pick<MapData, 'doors' | 'indoor' | 'places'>;

/**
 * The zone reached by leaving this map each way: the first gap door (one that names its way) on that side. Not cached,
 * since a live world opens more doors in a loaded map as it grows. A room has none.
 */
export function exitsOf(data: Pick<MapData, 'doors' | 'indoor'>): SignWays {
  const exits: SignWays = {};
  if (!data.indoor) for (const d of data.doors) if (d.dir && !exits[d.dir]) exits[d.dir] = d.to.zone;
  return exits;
}

/** The ways a sign can honestly name on this map: its places kept, its zones the ones really there (see the header). */
export function liveWays(ways: SignWays, data: SignMap): SignWays {
  const exits = exitsOf(data);
  const here = new Set(data.places.map((p) => p.name));
  const out: SignWays = {};
  for (const d of SIGN_ORDER) {
    const to = ways[d];
    const via = !to ? undefined : here.has(to) ? to : exits[d];
    if (via) out[d] = via;
  }
  return out;
}

/** The text of a sign's ways: one page, a line per way with its arrow and compass point. */
export function waysText(ways: SignWays): string {
  return SIGN_ORDER.flatMap((d) => (ways[d] ? [`${ARROWS[d]}: ${zoneName(ways[d])}`] : [])).join('\n');
}

/**
 * What a signpost says. A rewrite by the Dungeon Master (`override`, a page per line) wins; else the authored ways read
 * against the map (`liveWays`); when none is left the sign says, in the DM's dry voice, that the road goes nowhere
 * (`pick` chooses the wording: a random one is fine, it is only said).
 */
export function signLines(
  ways: SignWays,
  data: SignMap,
  override?: readonly string[],
  pick: (n: number) => number = (n) => Math.floor(Math.random() * n),
): string[] {
  if (override?.length) return [...override];
  const text = waysText(liveWays(ways, data));
  return [text || SIGN_NOWHERE_WORDS[pick(SIGN_NOWHERE_WORDS.length)]!];
}

/** The key an override is kept under: a cell of a map (the region's, in the world log). */
export const signKey = (col: number, row: number) => `${col},${row}`;

/**
 * The signpost a player at (x, y) reads: the nearest one within `reach` px of its foot (cell `col,row`). Like an NPC,
 * it needs only the player standing close, not facing it.
 */
export function signNear<T extends { col: number; row: number }>(
  signs: readonly T[],
  x: number,
  y: number,
  reach: number,
  cell = 32,
): T | undefined {
  let best: T | undefined;
  let bestD = reach;
  for (const s of signs) {
    const d = Math.hypot((s.col + 0.5) * cell - x, (s.row + 0.5) * cell - y);
    if (d < bestD) [best, bestD] = [s, d];
  }
  return best;
}
