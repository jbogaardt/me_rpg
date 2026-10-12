// Pixi-free: where a map's edge is, and how near a player is to the margin of neighbours it carries.

import type { Bounds } from '../core/camera';
import { CELL, type MapData } from './types';

/** The whole map as a box (world px): the camera stays inside it. */
export function mapBox(data: Pick<MapData, 'width' | 'height'>): Bounds {
  return { left: 0, top: 0, right: data.width * CELL, bottom: data.height * CELL };
}

/**
 * Is any cell of the neighbours' margin (surface `beyond`) within `reach` px of (x, y)? Then the next zones over are
 * about to be in view and worth loading, whether or not a gap is close.
 */
export function nearBorder(
  data: Pick<MapData, 'width' | 'height' | 'surfaces' | 'surface'>,
  x: number,
  y: number,
  reach: number,
): boolean {
  const beyond = data.surfaces.indexOf('beyond');
  if (beyond < 0) return false;
  const c0 = Math.max(0, Math.floor((x - reach) / CELL));
  const c1 = Math.min(data.width - 1, Math.floor((x + reach) / CELL));
  const r0 = Math.max(0, Math.floor((y - reach) / CELL));
  const r1 = Math.min(data.height - 1, Math.floor((y + reach) / CELL));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) if (data.surface[r * data.width + c] === beyond) return true;
  return false;
}
