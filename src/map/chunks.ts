// Pixi-free bookkeeping for drawing a map in chunks (map/MapView.ts): which chunks a view needs, and which chunk each
// map object belongs to.

import { CELL, type MapData } from './types';

/** Cells per side of a chunk (512 px). */
export const CHUNK = 16;

/** A rect in world px (camera.ts `ViewRect`). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The chunks (inclusive, clamped to the map) that a view touches, grown by `margin` chunks on every side. */
export function chunkRange(view: Rect, cols: number, rows: number, margin: number) {
  const size = CHUNK * CELL;
  return {
    c0: Math.max(0, Math.floor(view.x / size) - margin),
    r0: Math.max(0, Math.floor(view.y / size) - margin),
    c1: Math.min(cols - 1, Math.floor((view.x + view.w) / size) + margin),
    r1: Math.min(rows - 1, Math.floor((view.y + view.h) / size) + margin),
  };
}

/**
 * Object indices by chunk: an object belongs to the chunk under the middle of its bottom edge (where it stands),
 * clamped to the map. Objects are at most a few cells big, so one chunk of margin round a view shows every one in it.
 */
export function chunksOfObjects(data: Pick<MapData, 'width' | 'height' | 'objects'>): number[][] {
  const cols = Math.ceil(data.width / CHUNK);
  const rows = Math.ceil(data.height / CHUNK);
  const out: number[][] = Array.from({ length: cols * rows }, () => []);
  data.objects.forEach((o, i) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((o.px + o.w / 2) / (CHUNK * CELL))));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((o.py + o.h - 1) / (CHUNK * CELL))));
    out[cy * cols + cx]!.push(i);
  });
  return out;
}
