// Builds public/tilesets/delve_fx.png: the see-through tiles that dress every cave, crypt and sewer (see delveStyle.ts for
// the layout): soft edge shadows where floor meets wall, pale foam where water meets floor, wet patches, cracks, moss and
// pebbles for the floor, a speckled rock texture and a light rim and a hanging cliff face for the edges of the floor. All drawn here from a few colours of the
// sewer's own palette (no outside art, so nothing to credit). Run with `npm run tilesets`; the output is committed.

import path from 'node:path';
import { ROOT, writePng, type Image } from './image';
import { blank } from './compose';
import {
  bayer,
  DECALS,
  FADE_ROWS,
  E,
  FX_CELL,
  hash,
  N,
  ROOF_VARIANTS,
  S,
  shadeAt,
  W,
  type DecalKind,
  decalTile,
  fadeTile,
  foamTile,
  rimTile,
  roofTile,
  shadowTile,
} from './delveStyle';

type Rgb = readonly [number, number, number];
const C = FX_CELL;

function sheetImage(): Image {
  return blank(C * 16, C * 6);
}

/** Paint one pixel (straight alpha, replacing what is there unless `keep`: the larger alpha wins). */
function put(img: Image, ox: number, oy: number, x: number, y: number, [r, g, b]: Rgb, alpha: number, keep = false) {
  if (x < 0 || y < 0 || x >= C || y >= C) return;
  const i = ((oy + y) * img.width + ox + x) * 4;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  if (keep && img.data[i + 3] >= a) return;
  img.data.set([r, g, b, a], i);
}

/** Distance in px from the lit edge for each side of `mask` (the nearest). */
function edgeDistance(mask: number, x: number, y: number): number {
  let d = Infinity;
  if (mask & N) d = Math.min(d, y);
  if (mask & S) d = Math.min(d, C - 1 - y);
  if (mask & W) d = Math.min(d, x);
  if (mask & E) d = Math.min(d, C - 1 - x);
  return d;
}

const SHADOW: Rgb = [5, 6, 18];
function drawShadow(img: Image, mask: number) {
  const [ox, oy] = shadowTile(mask);
  for (let y = 0; y < C; y++)
    for (let x = 0; x < C; x++) {
      // Stepped bands with a 2x2 dither across each step: soft but still pixel art.
      const d = edgeDistance(mask, x, y);
      const here = shadeAt(d);
      const next = shadeAt(d + 1);
      const a = here > next && bayer(x, y) < 0.5 ? next : here;
      if (a > 0) put(img, ox, oy, x, y, SHADOW, a);
    }
}

const FOAM: Rgb = [176, 210, 196];
const FOAM_MID: Rgb = [112, 160, 140];
function drawFoam(img: Image, mask: number) {
  const [ox, oy] = foamTile(mask);
  for (let y = 0; y < C; y++)
    for (let x = 0; x < C; x++) {
      const d = edgeDistance(mask, x, y);
      if (d > 4) continue;
      // The edge wobbles along its length so the foam breaks into bubbles and lace.
      const wob = Math.sin((x + y) * 0.9 + (mask & (N | S) ? 0 : 1.7)) + Math.sin((x - y) * 0.47 + mask);
      const reach = 1.4 + wob * 0.9;
      if (d < 1) put(img, ox, oy, x, y, FOAM, 0.95);
      else if (d < reach) put(img, ox, oy, x, y, FOAM, 0.8);
      else if (d < reach + 1.2 && bayer(x, y) < 0.55) put(img, ox, oy, x, y, FOAM_MID, 0.6);
      else if (d < 4 && hash(x, y, mask + 31) < 0.07) put(img, ox, oy, x, y, FOAM, 0.55);
    }
}

// The roof and its rim are neutral light and shade (white and black at low alpha) so they sit on any theme's rock.
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
function drawRim(img: Image, mask: number) {
  const [ox, oy] = rimTile(mask);
  for (let y = 0; y < C; y++)
    for (let x = 0; x < C; x++) {
      // A side edge (east, west): outline, a thin dark face dropping away, then the lit lip on the floor's rim.
      const side = Math.min(mask & W ? x : Infinity, mask & E ? C - 1 - x : Infinity);
      if (side < 1) put(img, ox, oy, x, y, BLACK, 0.8);
      else if (side < 5) put(img, ox, oy, x, y, BLACK, side < 3 ? 0.6 : 0.4);
      else if (side === 5) put(img, ox, oy, x, y, WHITE, 0.3);
      else if (side === 6 && bayer(x, y) < 0.5) put(img, ox, oy, x, y, WHITE, 0.2);
      // A south edge: the lit lip; the hanging cliff face is the cells below (`dress` in delve.ts).
      const south = mask & S ? C - 1 - y : Infinity;
      if (south < 1) put(img, ox, oy, x, y, WHITE, 0.36, true);
      else if (south < 3 && bayer(x, y) < 0.5) put(img, ox, oy, x, y, WHITE, 0.16, true);
      // A north edge: a thin light line.
      const north = mask & N ? y : Infinity;
      if (north < 1) put(img, ox, oy, x, y, WHITE, 0.3, true);
      else if (north < 3 && bayer(x, y) < 0.5) put(img, ox, oy, x, y, WHITE, 0.13, true);
    }
}

/** The hanging cliff face under a south edge fades into the dark: row 0 lightly, row 1 to the backdrop's near-black. */
const VOID_DARK: Rgb = [22, 14, 18];
function drawFade(img: Image, row: number) {
  const [ox, oy] = fadeTile(row);
  const [from, to] = row === 0 ? [0.0, 0.3] : [0.3, 0.92];
  for (let y = 0; y < C; y++)
    for (let x = 0; x < C; x++) {
      const a = from + ((to - from) * y) / (C - 1);
      // Stepped like the shade bands: a 2x2 dither between quarter steps.
      const q = Math.floor(a * 8);
      const up = a * 8 - q > bayer(x, y) ? 1 : 0;
      put(img, ox, oy, x, y, VOID_DARK, Math.min(1, (q + up) / 8));
    }
  // A dark under-lip line at the top of the face, so the lit rim above reads as an edge.
  if (row === 0) for (let x = 0; x < C; x++) put(img, ox, oy, x, 0, BLACK, 0.5);
}

function drawRoof(img: Image, variant: number) {
  const [ox, oy] = roofTile(variant);
  // Broken rock: scattered chips with a light top-left edge and a shadow below-right, and a few long cracks.
  for (let k = 0; k < 9; k++) {
    const cx = Math.floor(hash(k, variant, 11) * (C - 5)) + 1;
    const cy = Math.floor(hash(k, variant, 12) * (C - 4)) + 1;
    const w = 2 + Math.floor(hash(k, variant, 13) * 4);
    const h = 1 + Math.floor(hash(k, variant, 14) * 2);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) put(img, ox, oy, cx + x, cy + y, WHITE, y === 0 ? 0.17 : 0.08);
    for (let x = 1; x <= w; x++) put(img, ox, oy, cx + x, cy + h, BLACK, 0.4);
  }
  let x = Math.floor(hash(1, variant, 21) * C);
  let y = Math.floor(hash(2, variant, 21) * 6);
  for (let k = 0; k < 18; k++) {
    put(img, ox, oy, x, y, BLACK, 0.45);
    const r = hash(k, variant, 22);
    x += r < 0.33 ? -1 : r > 0.66 ? 1 : 0;
    y += 1;
  }
}

function blob(
  img: Image,
  ox: number,
  oy: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  paint: (x: number, y: number, edge: number) => void,
) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const wob = (hash(x, y, seed) - 0.5) * 0.35;
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + wob;
      if (e <= 1) paint(x, y, e);
    }
  void img;
  void ox;
  void oy;
}

const WET_DARK: Rgb = [28, 38, 66];
const WET_MID: Rgb = [48, 66, 100];
const WET_SHINE: Rgb = [170, 205, 215];
function drawPuddle(img: Image, ox: number, oy: number, v: number) {
  const rx = 6 + hash(v, 1, 41) * 5;
  const ry = 3 + hash(v, 2, 41) * 3;
  const cx = 14 + hash(v, 3, 41) * 5;
  const cy = 14 + hash(v, 4, 41) * 6;
  blob(img, ox, oy, cx, cy, rx, ry, 50 + v, (x, y, e) => {
    if (e > 0.8) put(img, ox, oy, x, y, WET_MID, 0.35);
    else put(img, ox, oy, x, y, WET_DARK, 0.5);
  });
  // The shine: the sewer's light caught at the top-left of the water, in two or three bright pixels.
  const sx = Math.round(cx - rx * 0.4);
  const sy = Math.round(cy - ry * 0.35);
  put(img, ox, oy, sx, sy, WET_SHINE, 0.95);
  put(img, ox, oy, sx + 1, sy, WET_SHINE, 0.7);
  put(img, ox, oy, sx + 3, sy + 1, WET_SHINE, 0.5);
}

const CRACK: Rgb = [34, 32, 48];
const CRACK_LIT: Rgb = [112, 114, 140];
function drawCrack(img: Image, ox: number, oy: number, v: number) {
  let x = 4 + Math.floor(hash(v, 5, 42) * 20);
  let y = 3 + Math.floor(hash(v, 6, 42) * 6);
  const branch = 6 + Math.floor(hash(v, 7, 42) * 8);
  for (let k = 0; k < 20; k++) {
    put(img, ox, oy, x, y, CRACK, 0.95);
    put(img, ox, oy, x + 1, y + 1, CRACK_LIT, 0.35);
    const r = hash(k, v, 43);
    x += r < 0.3 ? -1 : r > 0.7 ? 1 : 0;
    y += r < 0.15 || r > 0.85 ? 0 : 1;
    if (k === branch) {
      let bx = x;
      let by = y;
      for (let j = 0; j < 6; j++) {
        bx += hash(j, v, 44) < 0.5 ? 1 : 0;
        by += 1;
        put(img, ox, oy, bx, by, CRACK, 0.9);
      }
    }
  }
}

const MOSS: Rgb = [70, 104, 92];
const MOSS_HI: Rgb = [104, 140, 112];
function drawMoss(img: Image, ox: number, oy: number, v: number) {
  // A clump in a corner of the cell, dithered at its edge.
  const cx = hash(v, 8, 45) < 0.5 ? 4 : 27;
  const cy = hash(v, 9, 45) < 0.5 ? 4 : 27;
  blob(img, ox, oy, cx, cy, 8, 6, 60 + v, (x, y, e) => {
    if (e < 0.55 || bayer(x, y) > e - 0.1)
      put(img, ox, oy, x, y, e < 0.35 && hash(x, y, 5) < 0.3 ? MOSS_HI : MOSS, 0.85);
  });
}

const PEBBLE: Rgb = [112, 116, 140];
const PEBBLE_SHADE: Rgb = [40, 40, 58];
function drawPebbles(img: Image, ox: number, oy: number, v: number) {
  for (let k = 0; k < 4; k++) {
    const x = 3 + Math.floor(hash(k, v, 46) * 24);
    const y = 4 + Math.floor(hash(k, v, 47) * 22);
    const big = hash(k, v, 48) < 0.4;
    put(img, ox, oy, x, y, PEBBLE, 1);
    put(img, ox, oy, x + 1, y, PEBBLE, 1);
    if (big) {
      put(img, ox, oy, x, y + 1, PEBBLE, 1);
      put(img, ox, oy, x + 1, y + 1, PEBBLE, 1);
    }
    for (let i = 0; i <= (big ? 2 : 1); i++) put(img, ox, oy, x + i, y + (big ? 2 : 1), PEBBLE_SHADE, 0.9);
    put(img, ox, oy, x + (big ? 2 : 2), y, PEBBLE_SHADE, 0.6);
  }
}

const STAIN: Rgb = [30, 28, 44];
function drawStain(img: Image, ox: number, oy: number, v: number) {
  const cx = 10 + hash(v, 10, 49) * 12;
  const cy = 10 + hash(v, 11, 49) * 12;
  blob(img, ox, oy, cx, cy, 9, 6, 70 + v, (x, y, e) => {
    const a = e < 0.4 ? 0.34 : 0.2;
    if (e < 0.7 || bayer(x, y) < 0.5) put(img, ox, oy, x, y, STAIN, a);
  });
}

const DRAW: Record<DecalKind, (img: Image, ox: number, oy: number, v: number) => void> = {
  puddle: drawPuddle,
  crack: drawCrack,
  moss: drawMoss,
  pebbles: drawPebbles,
  stain: drawStain,
};

export function buildDelveFx(): Image {
  const img = sheetImage();
  for (let m = 1; m < 16; m++) {
    drawShadow(img, m);
    drawFoam(img, m);
    drawRim(img, m);
  }
  for (let v = 0; v < FADE_ROWS; v++) drawFade(img, v);
  for (let v = 0; v < ROOF_VARIANTS; v++) drawRoof(img, v);
  for (const d of DECALS) for (let v = 0; v < d.count; v++) DRAW[d.kind](img, ...decalTile(d.kind, v), v);
  return img;
}

if (process.argv[1]?.endsWith('delveFx.ts')) {
  writePng(path.join(ROOT, 'public/tilesets/delve_fx.png'), buildDelveFx());
  console.log('wrote delve_fx.png');
}
