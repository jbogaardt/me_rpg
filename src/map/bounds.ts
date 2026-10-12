// Pixi-free: the rectangle of a map that belongs to the zone itself. A biome's map carries a margin of its neighbours
// (surface `beyond`) that is blocked and never drawn, so the camera must not show it: this is the box it stays inside.

import type { Bounds } from '../core/camera';
import { CELL, type MapData } from './types';

type BoundsSource = Pick<MapData, 'width' | 'height' | 'surfaces' | 'surface'>;

const cache = new WeakMap<object, Bounds>();

/** The box (world px) round every cell that is not a neighbour's margin; a room, with no margin, is the whole map. */
export function zoneBounds(data: BoundsSource): Bounds {
  const known = cache.get(data);
  if (known) return known;
  const beyond = data.surfaces.indexOf('beyond');
  const { width: w, height: h } = data;
  let left = w;
  let right = -1;
  let top = h;
  let bottom = -1;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (beyond >= 0 && data.surface[row * w + col] === beyond) continue;
      if (col < left) left = col;
      if (col > right) right = col;
      if (row < top) top = row;
      bottom = row;
    }
  }
  const box: Bounds =
    right < 0
      ? { left: 0, top: 0, right: w * CELL, bottom: h * CELL }
      : { left: left * CELL, top: top * CELL, right: (right + 1) * CELL, bottom: (bottom + 1) * CELL };
  cache.set(data, box);
  return box;
}
