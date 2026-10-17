// Compass words for directions the player is told (Pixi-free, tested; core engine, local to each page): which way a thing
// lies from the player or from a named place, and roughly how far, so "by the shore" becomes "the shore, far to the
// north-east". North is up (screen y grows downwards). Text only: nothing here draws a compass (that is a capability, see
// `capabilities.ts`). Used by the arrow's label (`StoryUi`) and by the DM's writers, which are asked to give a bearing
// (`server/claude.ts` RULES).

import { CELL } from '../map/types';

export const BEARINGS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;
export type Bearing = (typeof BEARINGS)[number];

export interface Point {
  x: number;
  y: number;
}

/** The eight-point compass word for the way from `from` to `to` (pixels; north is up). Null when they are the same spot. */
export function bearing(from: Point, to: Point): Bearing | null {
  const dx = to.x - from.x;
  const dy = from.y - to.y; // up is north
  if (dx === 0 && dy === 0) return null;
  const turns = Math.atan2(dx, dy) / (Math.PI / 4); // 0 = north, clockwise
  return BEARINGS[(Math.round(turns) + 8) % 8]!;
}

/** Distance bands, in cells: within sight, a short walk, a way off, a long road. */
const BANDS: [number, string][] = [
  [8, 'close by'],
  [24, 'a short way'],
  [60, 'a good way'],
  [Infinity, 'far'],
];

/** A rough distance in words for `px` pixels. */
export function distanceWord(px: number): string {
  const cells = px / CELL;
  return BANDS.find(([max]) => cells < max)![1];
}

/**
 * "far to the north-east" (or "close by" when on the spot): the way to `to` from `from`. With `of` (a named place) it is
 * read from that place instead: "a short way east of the Old Mill", where `from` is then the place's own position.
 */
export function direction(from: Point, to: Point, of?: string): string {
  const b = bearing(from, to);
  const d = distanceWord(Math.hypot(to.x - from.x, to.y - from.y));
  if (!b) return d === 'close by' ? d : `${d} away`;
  const way = d === 'close by' ? `close by, to the ${b}` : `${d} to the ${b}`;
  return of ? way.replace(/(?:, | )to the /, ' ') + ` of ${of}` : way;
}
