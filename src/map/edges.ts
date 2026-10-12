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

/** Cells either side of the player that the zone's border is looked at over: more than half of any view (20-40 cells wide). */
const LOOK_ROWS = 16;
const LOOK_COLS = 21;
/** The border's profile is averaged over this many cells either side, so the camera glides instead of stepping. */
const SMOOTH = 4;
/** The player always keeps this far (px) from the edge of the view, whatever the profile says. */
const KEEP = 2 * CELL;

/**
 * The zone's own cells as the view must see them: for every row the span of columns that belong to this zone (the rest
 * is the neighbours' margin, surface `beyond`) and for every column the span of rows, in px. Each is the tightest span
 * over the cells the view can show, then averaged, so the camera stops where the zone ends and never slides sideways
 * at a step in a ragged border.
 */
export interface ZoneRegion {
  rowLo: number[];
  rowHi: number[];
  colLo: number[];
  colHi: number[];
}

type RegionSource = Pick<MapData, 'width' | 'height' | 'surfaces' | 'surface'>;

/** `v` (NaN = nothing to say) widened to the most extreme value within `reach`, then averaged: `pick` is Math.min or Math.max. */
function tighten(v: number[], reach: number, pick: (...n: number[]) => number): number[] {
  const near = v.map((_, i) => {
    const seen = v.slice(Math.max(0, i - reach), i + reach + 1).filter((n) => !Number.isNaN(n));
    return seen.length ? pick(...seen) : NaN;
  });
  return near.map((_, i) => {
    const seen = near.slice(Math.max(0, i - SMOOTH), i + SMOOTH + 1).filter((n) => !Number.isNaN(n));
    return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : NaN;
  });
}

const regions = new WeakMap<object, ZoneRegion>();

/** Where this map's own cells lie (cached per map). A room, with no neighbour's margin, spans the whole map. */
export function zoneRegion(data: RegionSource): ZoneRegion {
  const cached = regions.get(data);
  if (cached) return cached;
  const beyond = data.surfaces.indexOf('beyond');
  const { width: w, height: h } = data;
  const rowLo: number[] = Array<number>(h).fill(NaN);
  const rowHi: number[] = Array<number>(h).fill(NaN);
  const colLo: number[] = Array<number>(w).fill(NaN);
  const colHi: number[] = Array<number>(w).fill(NaN);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (data.surface[r * w + c] === beyond) continue;
      if (Number.isNaN(rowLo[r])) rowLo[r] = c * CELL;
      rowHi[r] = (c + 1) * CELL;
      if (Number.isNaN(colLo[c])) colLo[c] = r * CELL;
      colHi[c] = (r + 1) * CELL;
    }
  }
  const region = {
    rowLo: tighten(rowLo, LOOK_ROWS, Math.max),
    rowHi: tighten(rowHi, LOOK_ROWS, Math.min),
    colLo: tighten(colLo, LOOK_COLS, Math.max),
    colHi: tighten(colHi, LOOK_COLS, Math.min),
  };
  regions.set(data, region);
  return region;
}

const at = (a: number[], i: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(i)))] ?? NaN;

/** The view limits that keep a player at (x, y) inside their zone's own cells, but never off-screen (`KEEP`). */
function regionLimits(r: ZoneRegion, x: number, y: number): EdgeLimits {
  const out: EdgeLimits = {};
  const left = at(r.rowLo, y / CELL);
  const right = at(r.rowHi, y / CELL);
  const top = at(r.colLo, x / CELL);
  const bottom = at(r.colHi, x / CELL);
  if (!Number.isNaN(left)) out.left = Math.min(left, x - KEEP);
  if (!Number.isNaN(right)) out.right = Math.max(right, x + KEEP);
  if (!Number.isNaN(top)) out.top = Math.min(top, y - KEEP);
  if (!Number.isNaN(bottom)) out.bottom = Math.max(bottom, y + KEEP);
  return out;
}

/**
 * The limits on the view for a player at (x, y) in a zone with these doors. Each door that names the way it leads
 * stops the view at its border while the player is near it along the border (both ways: the old side and the new).
 * Away from a gap the view is held by the zone's own edge instead when the `region` is given (so the player walks to
 * the screen's edge there too, and the neighbours' margin is never shown), or is free without it.
 */
export function edgeLimits(
  doors: Pick<MapData, 'doors'>['doors'],
  x: number,
  y: number,
  region?: ZoneRegion,
): EdgeLimits {
  const base = region ? regionLimits(region, x, y) : {};
  const out: EdgeLimits = { ...base };
  const held: Partial<Record<'left' | 'right' | 'top' | 'bottom', number>> = {}; // how free each side is (0 = at a gap)
  for (const d of doors) {
    if (!d.dir) continue;
    const across = d.dir === 'left' || d.dir === 'right'; // the border runs up and down
    const along = across ? Math.abs(y - (d.row + 0.5) * CELL) : Math.abs(x - (d.col + d.w / 2) * CELL);
    const t = smooth((along - HOLD_CELLS * CELL) / (FADE_CELLS * CELL));
    const side = d.dir === 'right' ? 'right' : d.dir === 'left' ? 'left' : d.dir === 'down' ? 'bottom' : 'top';
    if (t >= (held[side] ?? Infinity)) continue; // the nearest gap on that side decides
    held[side] = t;
    const border =
      d.dir === 'right'
        ? (d.col + 1) * CELL
        : d.dir === 'down'
          ? (d.row + 1) * CELL
          : d.dir === 'left'
            ? d.col * CELL
            : d.row * CELL;
    const sign = d.dir === 'right' || d.dir === 'down' ? 1 : -1;
    const far = base[side] ?? border + sign * FAR;
    out[side] = border + (far - border) * t;
  }
  return out;
}
