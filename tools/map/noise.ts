// Smooth value noise for shaping the map (borders, ragged walls, ground edges, swamp pools). Deterministic from a seed.

/** Smooth value noise in -1..1 on a lattice of `scale` cells, from a seed. */
export function noise(seed: number, scale: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / scale,
      fy = y / scale;
    const x0 = Math.floor(fx),
      y0 = Math.floor(fy);
    const tx = fade(fx - x0),
      ty = fade(fy - y0);
    const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * tx;
    const b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/** Fractal noise in about -1..1: broad shapes, a mid scale for bays and points, and a little roughness. */
export function fbm(seed: number, scale: number) {
  const a = noise(seed, scale),
    b = noise(seed + 101, scale / 2.2),
    c = noise(seed + 211, scale / 5);
  return (x: number, y: number) => (a(x, y) * 0.6 + b(x, y) * 0.3 + c(x, y) * 0.1) * 1.6;
}

/** A cell mask as rects, one per run of cells in a row (what `paint`, `block` and `grove` take). */
export function maskRects(
  inside: (col: number, row: number) => boolean,
  area: { col: number; row: number; w: number; h: number },
) {
  const out: { col: number; row: number; w: number; h: number }[] = [];
  for (let row = area.row; row < area.row + area.h; row++) {
    let start = -1;
    for (let col = area.col; col <= area.col + area.w; col++) {
      const on = col < area.col + area.w && inside(col, row);
      if (on && start < 0) start = col;
      if (!on && start >= 0) {
        out.push({ col: start, row, w: col - start, h: 1 });
        start = -1;
      }
    }
  }
  return out;
}

/**
 * Smooth a cell mask: a cell keeps what most of its 3x3 neighbourhood has (`passes` times), which removes single-cell
 * spikes and pinholes and rounds corners without moving the shape. Returns a new mask, row-major `w` x `h`.
 */
export function smoothMask(mask: Uint8Array, w: number, h: number, passes = 1): Uint8Array {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(cur.length);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c + dc,
              rr = r + dr;
            n += cc >= 0 && rr >= 0 && cc < w && rr < h ? cur[rr * w + cc] : 0;
          }
        next[r * w + c] = n >= 5 ? 1 : 0;
      }
    cur = next;
  }
  return cur;
}

/**
 * Distance (cells, a chamfer approximation of the straight-line one) from each cell of a `w` x `h` grid to the nearest
 * cell where `mask` is set; 0 on the mask itself. Row-major.
 */
export function distanceField(mask: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 1e6;
  const D = Math.SQRT2;
  const relax = (i: number, c: number, r: number, dc: number, dr: number, cost: number) => {
    const nc = c + dc,
      nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= w || nr >= h) return;
    const v = d[nr * w + nc] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      relax(i, c, r, -1, 0, 1);
      relax(i, c, r, 0, -1, 1);
      relax(i, c, r, -1, -1, D);
      relax(i, c, r, 1, -1, D);
    }
  for (let r = h - 1; r >= 0; r--)
    for (let c = w - 1; c >= 0; c--) {
      const i = r * w + c;
      relax(i, c, r, 1, 0, 1);
      relax(i, c, r, 0, 1, 1);
      relax(i, c, r, 1, 1, D);
      relax(i, c, r, -1, 1, D);
    }
  return d;
}
