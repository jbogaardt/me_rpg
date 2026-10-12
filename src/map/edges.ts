// Pixi-free: where the camera must stop so that a crossing between two biomes happens at the edge of the screen, like a
// Zelda screen change. A gap between biomes (`MapData.doors` with a `dir`) has its doors on the border; walking toward
// one, the view may not go past the border, so the player walks off-centre to the very edge of the screen, and the one
// slide that follows moves exactly one screen: the old picture ends at the border and the new one starts from it.

import type { EdgeLimits } from '../core/camera';
import { CELL, type MapData } from './types';

/** Within this many cells (along the border) of a gap the view stops at the border. */
export const HOLD_CELLS = 10;
/** Over this many more cells the stop eases off, so the camera never jumps as the player moves along the border. */
export const FADE_CELLS = 8;
/** How far past the border the view may go once the stop has eased off entirely (px): further than any screen. */
const FAR = 200 * CELL;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * The limits on the view for a player at (x, y) in a zone with these doors. Each door that names the way it leads
 * stops the view at its border while the player is near it along the border (both ways: the old side and the new).
 */
export function edgeLimits(doors: Pick<MapData, 'doors'>['doors'], x: number, y: number): EdgeLimits {
  const out: EdgeLimits = {};
  for (const d of doors) {
    if (!d.dir) continue;
    const across = d.dir === 'left' || d.dir === 'right'; // the border runs up and down
    const along = across ? Math.abs(y - (d.row + 0.5) * CELL) : Math.abs(x - (d.col + d.w / 2) * CELL);
    const free = smooth((along - HOLD_CELLS * CELL) / (FADE_CELLS * CELL)) * FAR;
    if (d.dir === 'right') out.right = Math.min(out.right ?? Infinity, (d.col + 1) * CELL + free);
    else if (d.dir === 'left') out.left = Math.max(out.left ?? -Infinity, d.col * CELL - free);
    else if (d.dir === 'down') out.bottom = Math.min(out.bottom ?? Infinity, (d.row + 1) * CELL + free);
    else out.top = Math.max(out.top ?? -Infinity, d.row * CELL - free);
  }
  return out;
}
