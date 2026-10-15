// Barrels you can pick up and move (Pixi-free, tested). A barrel is a map object tagged `barrel` that the map builder
// leaves unblocked (`Prefab.movable`): in play each becomes an entity (`entities/Barrel.ts`) that blocks as a body
// where it stands, is carried over a player's head while held and is set down in front of them. Core engine: it asks
// the map's tag, never a content id.
import { DIR_VEC, type Direction } from '../core/direction';
import { CELL, type MapData } from '../map/types';
import { Collision, type Body } from './collision';

/** The tag of a map object that can be carried. */
export const BARREL_TAG = 'barrel';
/** How many people wide it blocks (collision `Body.size`): a barrel is about two bodies across. */
export const BARREL_SIZE = 2;
/** How near (feet to feet, px) a player must be to pick a barrel up. */
export const BARREL_REACH = CELL * 1.1;
/** How high a carried barrel rides above its carrier's feet, px. */
export const CARRY_LIFT = 46;
/** How far in front of a player a barrel is set down, nearest choice first (px). */
export const DROP_DISTANCES: readonly number[] = [26, 34, 18];
/** At most this many barrels per map (the snapshot lists the ones away from home). */
export const MAX_BARRELS = 40;

/** A barrel as the map places it: its index among the map's barrels (the same on every page) and where its feet stand. */
export interface BarrelSpot {
  /** Index in `MapData.objects`, which the map's drawn copy is hidden by. */
  object: number;
  x: number;
  y: number;
}

/**
 * The barrels of a map, in object order (which is their number everywhere), up to `MAX_BARRELS`. A barrel standing in a
 * neighbouring biome's margin (surface `beyond`) is that neighbour's own to carry, not this map's.
 */
export function barrelSpots(data: Pick<MapData, 'objects' | 'surfaces' | 'surface' | 'width'>): BarrelSpot[] {
  const beyond = data.surfaces.indexOf('beyond');
  const out: BarrelSpot[] = [];
  data.objects.forEach((o, object) => {
    if (o.tag !== BARREL_TAG || out.length >= MAX_BARRELS) return;
    const [x, y] = [o.px + o.w / 2, o.py + o.h];
    const cell = Math.floor((y - 1) / CELL) * data.width + Math.floor(x / CELL);
    if (beyond >= 0 && data.surface[cell] === beyond) return;
    out.push({ object, x, y });
  });
  return out;
}

/** The nearest of these (loose ones only) within `BARREL_REACH` of feet at (x, y), or undefined. */
export function nearestBarrel<T extends Body>(barrels: readonly T[], x: number, y: number): T | undefined {
  let best: T | undefined;
  let bestDist = BARREL_REACH;
  for (const b of barrels) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bestDist) [best, bestDist] = [b, d];
  }
  return best;
}

/**
 * Where a barrel can be set down by someone at (x, y) facing `facing`: the first spot in front (then nearer) where it
 * fits the map and overlaps no other body, or null when there is no room.
 */
export function dropSpot(
  collision: Collision,
  x: number,
  y: number,
  facing: Direction,
  others: Iterable<Body>,
): { x: number; y: number } | null {
  const [ux, uy] = DIR_VEC[facing];
  const list = [...others];
  // A probe far from everything: `canMove` then says only whether the spot fits and is free of other bodies.
  const probe: Body = { x: -1e6, y: -1e6, size: BARREL_SIZE };
  for (const d of DROP_DISTANCES) {
    const spot = { x: x + ux * d, y: y + uy * d };
    if (collision.canMove(probe, spot.x, spot.y, list)) return spot;
  }
  return null;
}

/** [object-order number, x, y, 1 if carried] of each barrel away from its home, flat, for the snapshot. */
export type BarrelWire = number[];

export function barrelsWire(
  barrels: readonly { x: number; y: number; home: { x: number; y: number }; carried: boolean }[],
): BarrelWire | undefined {
  const out: number[] = [];
  barrels.forEach((b, i) => {
    const away = b.carried || Math.abs(b.x - b.home.x) > 0.5 || Math.abs(b.y - b.home.y) > 0.5;
    if (away) out.push(i, Math.round(b.x), Math.round(b.y), b.carried ? 1 : 0);
  });
  return out.length ? out : undefined;
}

/** What the wire says about each listed barrel (an unlisted one is at home). */
export function barrelsFromWire(
  wire: readonly number[] | undefined,
): Map<number, { x: number; y: number; carried: boolean }> {
  const out = new Map<number, { x: number; y: number; carried: boolean }>();
  for (let i = 0; i + 3 < (wire?.length ?? 0); i += 4)
    out.set(wire![i]!, { x: wire![i + 1]!, y: wire![i + 2]!, carried: wire![i + 3] === 1 });
  return out;
}

/** Is this a well-formed `SnapMsg.barrels` (groups of four: a barrel number, x, y, carried 0/1)? */
export function validBarrelsWire(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length % 4 === 0 &&
    v.length <= MAX_BARRELS * 4 &&
    v.every((n: unknown, i) => {
      if (!Number.isInteger(n)) return false;
      const x = n as number;
      if (i % 4 === 0) return x >= 0 && x < MAX_BARRELS;
      if (i % 4 === 3) return x === 0 || x === 1;
      return Math.abs(x) <= 1e6;
    })
  );
}
