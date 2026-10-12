// Jarring ground: finds, in a built map, the places where the floor looks wrong, measured on the art as the game draws
// it (ground layers, then flat art such as cliffs over them), not on what the spec meant. Two kinds:
//   - a hard seam: the colour jumps right on a cell boundary. Autotiled terrain changes colour inside its edge tiles,
//     so a soft edge never jumps at the boundary; a fill butting against another fill does (a stepped border between
//     two grounds, a paved rect dropped on grass, a plateau whose top is another ground than its rim).
//   - a clash: the same kind of ground (the cells' `surface`) in two shades too far apart where they meet, even with
//     a soft edge (a deep green laid over a pale grass). A biome may mix grounds, but like a palette: close shades only.
// Run by `checkMap` (so `npm run map -- check`, the build and the zone tests).

import { CELL, type MapData } from '../../src/map/types';
import { coverage, sheet } from './image';

/** Colour jump (CIE76 ΔE, Lab) on a cell boundary that counts as a hard seam. */
export const SEAM_STEP = 14;
/** How much bigger the jump must be than the texture's own variation next to the boundary. */
const SEAM_RATIO = 2.5;
/** Shades of one kind of ground further apart than this (ΔE) clash where they meet. */
export const CLASH_DE = 22;
/** Seams under art covering more than this share of the cell are hidden (under a wood, a building). */
const HIDDEN = 0.6;
/** Surfaces drawn by autotiled terrains that bring their own bank (the sea, a fill, is checked like any ground). */
const BANKED = new Set(['water', 'bog', 'lava', 'pit', 'ice']);
/** Pixels each side of a boundary that are averaged (wide enough to wash out the texture's grain). */
const BAND = 6;

type Lab = [number, number, number];

function toLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** What the check needs of one cell's 32x32 floor: mean colours of its edge bands and of the bands just inside them. */
interface CellLook {
  flat: boolean; // flat art (a cliff) is drawn over part of it
  mean: Lab;
  pure: boolean; // one even ground across the cell (not an edge tile): its mean is the ground's colour
  edge: { l: Lab; r: Lab; t: Lab; b: Lab }; // the outer BAND px on each side
  inner: { l: Lab; r: Lab; t: Lab; b: Lab }; // the BAND px just inside those
}

function look(px: Uint8Array, flat = false): CellLook {
  const mean = (x0: number, y0: number, w: number, h: number): Lab => {
    let [r, g, b] = [0, 0, 0];
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * CELL + x) * 3;
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
      }
    const n = w * h;
    return toLab(r / n, g / n, b / n);
  };
  const S = CELL;
  const all = mean(0, 0, S, S);
  // Even: every 8 px block is close to the whole (an edge tile with a fringe in one corner is not).
  const blocks: Lab[] = [];
  for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) blocks.push(mean(x, y, 8, 8));
  return {
    flat,
    mean: all,
    pure: blocks.every((q) => dE(q, all) < 9),
    edge: {
      l: mean(0, 0, BAND, S),
      r: mean(S - BAND, 0, BAND, S),
      t: mean(0, 0, S, BAND),
      b: mean(0, S - BAND, S, BAND),
    },
    inner: {
      l: mean(BAND, 0, BAND, S),
      r: mean(S - 2 * BAND, 0, BAND, S),
      t: mean(0, BAND, S, BAND),
      b: mean(0, S - 2 * BAND, S, BAND),
    },
  };
}

/** Every cell's look (null where there is no ground: the dark beyond the drawn map). Equal stacks share one. */
function floorLooks(d: MapData): (CellLook | null)[] {
  const blit = (px: Uint8Array, s: number, sx: number, sy: number, w: number, h: number, dx: number, dy: number) => {
    const img = sheet(d.sheets[s]);
    for (let y = Math.max(0, dy); y < Math.min(CELL, dy + h); y++)
      for (let x = Math.max(0, dx); x < Math.min(CELL, dx + w); x++) {
        const tx = sx + x - dx,
          ty = sy + y - dy;
        if (tx < 0 || ty < 0 || tx >= img.width || ty >= img.height) continue;
        const si = (ty * img.width + tx) * 4;
        if (img.data[si + 3] < 128) continue; // the art is 0/255 alpha, as in renderMap
        const di = (y * CELL + x) * 3;
        px[di] = img.data[si]!;
        px[di + 1] = img.data[si + 1]!;
        px[di + 2] = img.data[si + 2]!;
      }
  };
  const ground = (g: number[]) => {
    const px = new Uint8Array(CELL * CELL * 3);
    for (let k = 0; k + 2 < g.length; k += 3) blit(px, g[k], g[k + 1], g[k + 2], CELL, CELL, 0, 0);
    return px;
  };
  // Flat art (cliffs: objects with an explicit z) is part of the floor; find the cells each one touches.
  const flats = new Map<number, typeof d.objects>();
  for (const o of d.objects) {
    if (o.z === undefined) continue;
    for (let r = Math.floor(o.py / CELL); r <= Math.floor((o.py + o.h - 1) / CELL); r++)
      for (let c = Math.floor(o.px / CELL); c <= Math.floor((o.px + o.w - 1) / CELL); c++) {
        if (c < 0 || r < 0 || c >= d.width || r >= d.height) continue;
        const i = r * d.width + c;
        flats.set(i, [...(flats.get(i) ?? []), o]);
      }
  }
  const shared = new Map<string, CellLook>();
  return d.ground.map((g, i) => {
    if (!g) return null;
    const over = flats.get(i);
    if (!over) {
      const key = g.join(',');
      let l = shared.get(key);
      if (!l) shared.set(key, (l = look(ground(g))));
      return l;
    }
    const px = ground(g);
    const [c0, r0] = [(i % d.width) * CELL, Math.floor(i / d.width) * CELL];
    for (const o of [...over].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)))
      blit(px, o.s, o.x, o.y, o.w, o.h, o.px - c0, o.py - r0);
    return look(px, true);
  });
}

export interface GroundReport {
  seams: { col: number; row: number; side: 'e' | 's'; step: number }[]; // the boundary east or south of the cell
  clashes: { col: number; row: number; col2: number; row2: number; surface: string; de: number }[];
}

/** Find the hard seams and clashing shades of a map's floor (only where at least one side is the map's own ground). */
export function groundReport(d: MapData): GroundReport {
  const W = d.width;
  const looks = floorLooks(d);
  const beyond = d.surfaces.indexOf('beyond');
  const own = (i: number) => d.surface[i] !== beyond;
  // Seams under props (a wood, a building) are hidden; flat art is the floor itself, so it does not hide anything.
  const cover = coverage({ ...d, objects: d.objects.filter((o) => o.z === undefined) });
  // A cell beside one of those (its edge tiles are mostly bank, so their surface is the shore's).
  const banked = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < W && r < d.height && BANKED.has(d.surfaces[d.surface[r * W + c]]);
  const nearBank = (c: number, r: number) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (banked(c + dc, r + dr)) return true;
    return false;
  };
  const report: GroundReport = { seams: [], clashes: [] };
  for (let row = 0; row < d.height; row++)
    for (let col = 0; col < W; col++) {
      const i = row * W + col;
      const a = looks[i];
      if (!a) continue;
      for (const [dc, dr, side] of [
        [1, 0, 'e'],
        [0, 1, 's'],
      ] as const) {
        const [c2, r2] = [col + dc, row + dr];
        if (c2 >= W || r2 >= d.height) continue;
        const j = r2 * W + c2;
        const b = looks[j];
        if (!b || a === b || (!own(i) && !own(j))) continue;
        if (cover[i] > HIDDEN || cover[j] > HIDDEN) continue;
        // Where cliff art ends, outside or partway into a cell, that is the edge of the cliff, not a seam in the
        // ground. On a plateau's top (both cells raised) it is the rim meeting the top, which must match.
        if ((a.flat || b.flat) && !(d.level[i] > 0 && d.level[j] > 0)) continue;
        // Ponds, bogs, lava, pits and ice are autotiled with a bank of their own: their edge is drawn, not a seam.
        if (nearBank(col, row) || nearBank(c2, r2)) continue;
        const [ea, ia, eb, ib] =
          side === 'e' ? [a.edge.r, a.inner.r, b.edge.l, b.inner.l] : [a.edge.b, a.inner.b, b.edge.t, b.inner.t];
        const step = dE(ea, eb);
        const grain = Math.max(dE(ea, ia), dE(eb, ib));
        if (step > SEAM_STEP && step > SEAM_RATIO * grain)
          report.seams.push({ col, row, side, step: Math.round(step) });
      }
    }
  // Clashes: two even cells of the same surface within two cells of each other, in shades too far apart.
  for (let row = 0; row < d.height; row++)
    for (let col = 0; col < W; col++) {
      const i = row * W + col;
      const a = looks[i];
      if (!a?.pure || a.flat || !own(i) || cover[i] > HIDDEN) continue; // under cliff art is not ground
      for (let dr = 0; dr <= 2; dr++)
        for (let dc = dr === 0 ? 1 : -2; dc <= 2; dc++) {
          const [c2, r2] = [col + dc, row + dr];
          if (c2 < 0 || c2 >= W || r2 >= d.height) continue;
          const j = r2 * W + c2;
          const b = looks[j];
          if (!b?.pure || b.flat || a === b || d.surface[i] !== d.surface[j] || cover[j] > HIDDEN) continue;
          const de = dE(a.mean, b.mean);
          if (de > CLASH_DE)
            report.clashes.push({
              col,
              row,
              col2: c2,
              row2: r2,
              surface: d.surfaces[d.surface[i]],
              de: Math.round(de),
            });
        }
    }
  return report;
}
