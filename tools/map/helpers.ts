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

const lcg = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

/**
 * A natural, irregular patch filling about `r`: a lobed outline (a circle stretched to the rect, its edge pushed in and
 * out by a few random waves, so it has bays and points) as rects, one per run of cells in a row. Paint it for lakes,
 * clearings, badlands and groves, so nothing looks like a box. `rough` (0..1) is how deep the bays go. Deterministic
 * for a given `seed`.
 */
export function blob(r: Rect, seed = r.col * 31 + r.row * 17 + r.w * 7 + r.h, rough = 0.4): Rect[] {
  const rand = lcg(seed);
  const waves = [2, 3, 4, 5, 7].map((k) => ({ k, a: (0.4 + rand()) / k, p: rand() * Math.PI * 2 }));
  const total = waves.reduce((n, w) => n + w.a, 0);
  const cx = r.col + r.w / 2,
    cy = r.row + r.h / 2;
  const out: Rect[] = [];
  for (let row = r.row; row < r.row + r.h; row++) {
    let start = -1;
    for (let col = r.col; col <= r.col + r.w; col++) {
      let inside = false;
      if (col < r.col + r.w) {
        const u = (col + 0.5 - cx) / (r.w / 2),
          v = (row + 0.5 - cy) / (r.h / 2);
        const t = Math.atan2(v, u);
        const wave = waves.reduce((n, w) => n + w.a * Math.sin(w.k * t + w.p), 0) / total; // -1..1
        inside = Math.hypot(u, v) <= 1 - rough * (0.5 + 0.5 * wave);
      }
      if (inside && start < 0) start = col;
      if (!inside && start >= 0) {
        out.push({ col: start, row, w: col - start, h: 1 });
        start = -1;
      }
    }
  }
  return out;
}

/**
 * A winding trail through `points` (each the top-left cell of a `w` x `w` node, consecutive points in a row or a
 * column, like `road`): it wanders up to `swing` cells to either side between nodes and runs straight into each, so it
 * still meets a gap's corridor (`World.gap`) square on. As rects to paint and keep clear.
 */
export function trail(points: [number, number][], opts: { w?: number; swing?: number; seed?: number } = {}): Rect[] {
  const w = opts.w ?? 3;
  const swing = opts.swing ?? 2.5;
  const rand = lcg(opts.seed ?? points.reduce((n, p) => n * 31 + p[0] * 7 + p[1], 17));
  const out: Rect[] = road(points.slice(0, 1).concat(points.slice(0, 1)), w); // the first node
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (a[0] !== b[0] && a[1] !== b[1]) throw new Error(`trail: (${a.join(',')}) to (${b.join(',')}) is not straight`);
    const across = a[1] === b[1]; // runs along a row
    const len = Math.abs(across ? b[0] - a[0] : b[1] - a[1]);
    const dir = Math.sign(across ? b[0] - a[0] : b[1] - a[1]) || 1;
    const [p1, p2, l1, l2] = [rand() * 6.3, rand() * 6.3, 14 + rand() * 10, 6 + rand() * 4];
    for (let t = 0; t <= len; t++) {
      const taper = Math.min(1, t / 6, (len - t) / 6);
      const o = Math.round(
        swing * taper * (0.7 * Math.sin((t / l1) * 6.283 + p1) + 0.3 * Math.sin((t / l2) * 6.283 + p2)),
      );
      out.push(
        across ? { col: a[0] + dir * t, row: a[1] + o, w: 1, h: w } : { col: a[0] + o, row: a[1] + dir * t, w, h: 1 },
      );
    }
    // The far node in full (the segment above covers its first column or row only).
    out.push({ col: b[0], row: b[1], w, h: w });
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

/**
 * Measure in the world layout's squares (maps/world.ts): biome specs place things by the drawing, so changing the
 * square size scales the whole world with them. `at(x, y)` is a cell, `area(x, y, w, h)` a rect, both from square
 * coordinates (fractions allowed).
 */
export function units(square: number) {
  const n = (v: number) => Math.round(v * square);
  return {
    S: square,
    at: (x: number, y: number): [number, number] => [n(x), n(y)],
    area: (x: number, y: number, w: number, h: number): Rect => ({
      col: n(x),
      row: n(y),
      w: Math.max(1, n(w)),
      h: Math.max(1, n(h)),
    }),
  };
}

/** Row `i` of a blob's rows (clamped, so a shape that came out smaller than expected still has one). */
export function pick(rows: Rect[], i: number): Rect {
  const r = rows[Math.min(rows.length - 1, Math.max(0, i))];
  if (!r) throw new Error('pick: the shape has no rows');
  return r;
}
