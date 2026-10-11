// Doors between zones, Pixi-free. A door is a row of cells in `MapData.doors`; walking onto one takes the player to the
// cell it names in another zone. The scene does the moving (OverworldScene.travel); this is just the geometry.

import { CELL, type DoorSpawn, type MapData } from './types';

/** The door whose cells the feet at (x, y) stand on, if any. (Feet sit at the very bottom of a cell, so look a pixel up.) */
export function doorAt(data: Pick<MapData, 'doors'>, x: number, y: number): DoorSpawn | undefined {
  const col = Math.floor(x / CELL);
  const row = Math.floor((y - 1) / CELL);
  return data.doors.find((d) => d.row === row && col >= d.col && col < d.col + d.w);
}

/** The doors within `radius` pixels of (x, y): the zones a player may be about to enter, worth loading ahead. */
export function doorsNear(data: Pick<MapData, 'doors'>, x: number, y: number, radius: number): DoorSpawn[] {
  return data.doors.filter((d) => {
    const cx = Math.max(d.col * CELL, Math.min(x, (d.col + d.w) * CELL));
    const cy = Math.max(d.row * CELL, Math.min(y, (d.row + 1) * CELL));
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
    const dy = arrival.row - d.row;
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
