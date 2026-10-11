// Small building blocks several zone specs share (kept out of maps/, where every file is a zone).

import type { Rect, ZoneApi } from './zone';

/** A short wall of rocks with open ends: `len` cells from (col, row), going east (or south when `vertical`). */
export function ridge(
  z: ZoneApi,
  col: number,
  row: number,
  len: number,
  vertical = false,
  kind: 'rockB' | 'rockC' | 'frostRockB' | 'frostRockC' = 'rockB',
) {
  for (let i = 0; i < len; i++) {
    const alt = kind.startsWith('frost') ? (i % 2 ? 'frostRockC' : 'frostRockB') : i % 2 ? 'rockC' : 'rockB';
    z.prop(alt, col + (vertical ? 0 : i), row + (vertical ? i : 0));
  }
}

/** A cell filter for `scatter`: true when (col, row) is at least `pad` cells away from every rect (paths, plazas...). */
export function awayFrom(rects: Rect[], pad = 1) {
  return (col: number, row: number) =>
    !rects.some((r) => col >= r.col - pad && col < r.col + r.w + pad && row >= r.row - pad && row < r.row + r.h + pad);
}

/**
 * A rounded, slightly ragged patch filling `r` (an ellipse with jittered row ends), as one rect per row: paint it for
 * lakes, clearings and badlands that should not look like boxes. Deterministic for a given `seed`.
 */
export function blob(r: Rect, seed = r.col * 31 + r.row * 17): Rect[] {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const out: Rect[] = [];
  const cx = r.col + r.w / 2;
  for (let i = 0; i < r.h; i++) {
    const y = (i + 0.5) / r.h - 0.5; // -0.5 .. 0.5
    const half = (r.w / 2) * Math.sqrt(Math.max(0, 1 - 4 * y * y));
    const left = Math.max(r.col, Math.round(cx - half + rand() * 0.8));
    const right = Math.min(r.col + r.w, Math.round(cx + half + rand() * 0.8));
    if (right > left) out.push({ col: left, row: r.row + i, w: right - left, h: 1 });
  }
  return out;
}

/**
 * A rounded pond filling `r`: water (blocked) inside a shore of `shore` (one cell wider all round), both as `blob`s.
 * Returns the water's rows, e.g. for lily pads.
 */
export function pond(
  z: ZoneApi,
  r: Rect,
  opts: {
    water?: 'pond' | 'bog' | 'lava' | 'abyss' | 'pit';
    shore?: 'sand' | 'meadow' | 'mud' | 'darkGrass' | 'snow';
  } = {},
): Rect[] {
  if (opts.shore) z.paint(opts.shore, blob({ col: r.col - 1, row: r.row - 1, w: r.w + 2, h: r.h + 2 }));
  const water = blob(r);
  z.paint(opts.water ?? 'pond', water);
  for (const row of water) z.block(row, opts.water ?? 'pond');
  return water;
}

/**
 * A road through `points` (each the top-left cell of a `w` x `w` node; consecutive points share a row or a column),
 * as rects to paint and keep clear. A gap's corridor (`World.gap`) is such a node, so a road into it lines up.
 */
export function road(points: [number, number][], w = 3): Rect[] {
  const out: Rect[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (a[0] !== b[0] && a[1] !== b[1]) throw new Error(`road: (${a.join(',')}) to (${b.join(',')}) is not straight`);
    out.push({
      col: Math.min(a[0], b[0]),
      row: Math.min(a[1], b[1]),
      w: Math.abs(a[0] - b[0]) + w,
      h: Math.abs(a[1] - b[1]) + w,
    });
  }
  return out;
}
