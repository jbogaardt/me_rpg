// Doors between zones, Pixi-free. A door is a row of cells in `MapData.doors`; walking onto one takes the player to the
// cell it names in another zone. The scene does the moving (OverworldScene.travel); this is just the geometry.

import { DIR_VEC } from '../core/direction';
import { CELL, type DoorSpawn, type MapData } from './types';

/** The door whose cells the feet at (x, y) stand on, if any. (Feet sit at the very bottom of a cell, so look a pixel up.) */
export function doorAt(data: Pick<MapData, 'doors'>, x: number, y: number): DoorSpawn | undefined {
  const col = Math.floor(x / CELL);
  const row = Math.floor((y - 1) / CELL);
  return data.doors.find((d) => onDoor(d, col, row));
}

/** Is the cell (col, row) one of the door's? */
export const onDoor = (d: Pick<DoorSpawn, 'col' | 'row' | 'w' | 'h'>, col: number, row: number) =>
  row >= d.row && row < d.row + (d.h ?? 1) && col >= d.col && col < d.col + d.w;

/** Every cell of a door, as [col, row]. */
export function doorCells(d: Pick<DoorSpawn, 'col' | 'row' | 'w' | 'h'>): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < (d.h ?? 1); r++) for (let c = 0; c < d.w; c++) out.push([d.col + c, d.row + r]);
  return out;
}

/** The doors within `radius` pixels of (x, y): the zones a player may be about to enter, worth loading ahead. */
export function doorsNear(data: Pick<MapData, 'doors'>, x: number, y: number, radius: number): DoorSpawn[] {
  return data.doors.filter((d) => {
    const cx = Math.max(d.col * CELL, Math.min(x, (d.col + d.w) * CELL));
    const cy = Math.max(d.row * CELL, Math.min(y, (d.row + (d.h ?? 1)) * CELL));
    return Math.hypot(x - cx, y - cy) <= radius;
  });
}

export type Facing = 'up' | 'down' | 'left' | 'right';

/**
 * Which way a player faces on arriving at `arrival` in a zone, having come from `from`: away from that zone's nearest
 * door back to `from` (they just walked in through it), so an east-edge door has them face right. Down when it has no
 * such door.
 */
export function arrivalFacing(
  dest: Pick<MapData, 'doors'>,
  from: string,
  arrival: { col: number; row: number },
): Facing {
  let best: { dx: number; dy: number } | undefined;
  for (const d of dest.doors) {
    if (d.to.zone !== from) continue;
    const dx = arrival.col - Math.max(d.col, Math.min(arrival.col, d.col + d.w - 1));
    const dy = arrival.row - Math.max(d.row, Math.min(arrival.row, d.row + (d.h ?? 1) - 1));
    if (!best || Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy)) best = { dx, dy };
  }
  if (!best) return 'down';
  if (Math.abs(best.dx) > Math.abs(best.dy)) return best.dx < 0 ? 'left' : 'right';
  return best.dy < 0 ? 'up' : 'down';
}

/** Feet position (world px) of a cell, matching how the scene places characters. */
export const cellFeet = (p: { col: number; row: number }): [number, number] => [
  (p.col + 0.5) * CELL,
  (p.row + 0.9) * CELL,
];

/** How many cells inside the next zone a gap's door puts the player (tools/map/world.ts `ARRIVE`: just past the far door). */
export const ARRIVE_CELLS = 1;

/** An open-air zone reached through a gap, and where its map sits relative to this one. */
export interface Link {
  zone: string;
  /** The way the gap goes from this zone: which side of it the other zone lies on. */
  dir: NonNullable<DoorSpawn['dir']>;
  /** Add to a point in this zone's pixels to get the same place in that zone's. */
  dx: number;
  dy: number;
}

const links = new WeakMap<object, Link[]>();

/**
 * The zones joined to this one by a gap in the border (doors that name the way they go), each with the offset between
 * the two maps' coordinates. The player standing on this zone's door cell arrives `1 + ARRIVE_CELLS` cells further on
 * in the other zone, so the same place is `to - door - direction * (1 + ARRIVE_CELLS)` cells away. Both maps draw the
 * same world, so with that offset one can be laid beside the other and they join without a seam. Rooms have none.
 */
export function neighbourLinks(data: Pick<MapData, 'doors' | 'indoor'>): Link[] {
  const known = links.get(data);
  if (known) return known;
  const found: Link[] = [];
  if (!data.indoor) {
    for (const d of data.doors) {
      if (!d.dir || found.some((l) => l.zone === d.to.zone)) continue;
      const [vx, vy] = DIR_VEC[d.dir];
      const step = 1 + ARRIVE_CELLS;
      found.push({
        zone: d.to.zone,
        dir: d.dir,
        dx: (d.to.col - d.col - vx * step) * CELL,
        dy: (d.to.row - d.row - vy * step) * CELL,
      });
    }
  }
  links.set(data, found);
  return found;
}

/**
 * Where a point of the zone `there` lies in `here`'s pixels, when the two are one world joined by a gap (null otherwise:
 * a room, or an open-air zone that is not next door). Crossing a gap only changes which map a player is in, so a friend a
 * few steps past it is in another zone while standing right beside the DM; reading "same zone" alone calls them far off.
 */
export function pointFromNeighbour(
  here: Pick<MapData, 'doors' | 'indoor'>,
  there: string,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const link = neighbourLinks(here).find((l) => l.zone === there);
  return link ? { x: x - link.dx, y: y - link.dy } : null;
}

/** How far ahead (px) a walk looks for a door: more than the DM covers in a frame, less than a cell. */
const DOOR_LOOK = CELL * 0.6;

/**
 * The heading (-1, 0 or 1 each) a bot-driven walk may take from feet at (x, y): the part of it that would step onto a
 * door is dropped, so the DM bot's amble about the party never carries him through a doorway into another zone (a person
 * at the keys walks through doors on purpose; the bot only means to stay near the party).
 */
export function keepOffDoors(
  data: Pick<MapData, 'doors'>,
  x: number,
  y: number,
  dx: number,
  dy: number,
): [number, number] {
  const hits = (ax: number, ay: number) => !!doorAt(data, x + ax * DOOR_LOOK, y + ay * DOOR_LOOK);
  if (!hits(dx, dy)) return [dx, dy];
  // Keep whichever axis is clear; a diagonal that is only blocked as a whole loses both.
  const [kx, ky] = [hits(dx, 0) ? 0 : dx, hits(0, dy) ? 0 : dy];
  return hits(kx, ky) ? [0, 0] : [kx, ky];
}
