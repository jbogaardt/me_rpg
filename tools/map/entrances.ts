// Builds public/tilesets/entrances.png: the overworld ends of the ways underground, composed so they sit in the land
// around them. The cave mouth is the LPC mountains' cave opening (art/lpc_mountains/, see CREDITS.md) widened with rock
// face cut from the same sheet into a rounded mound, its foot darkened and frayed into sand with a soft shadow below;
// the sewer hatch is the drain with a shadow ring. Pieces, left to right: cave mouth (128x83), hatch (32x32).
// Run with `npm run tilesets`; the output is committed. `ENTRANCE_ART` in catalog.ts names the pieces by rectangle.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { blank, crop, over } from './compose';

const SRC = readPng(path.join(ROOT, 'art/lpc_mountains/mountains.png'));
const SEWER = readPng(path.join(ROOT, 'public/tilesets/sewer_lpc.png'));

const OUTLINE = [77, 38, 32] as const;
const SAND = [
  [248, 214, 163],
  [246, 201, 152],
  [217, 174, 128],
] as const;

/** Fixed pseudo-noise in 0..1 (no PRNG state, so the sheet is the same every build). */
function hash(x: number, y: number, seed = 0) {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(seed + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const px = (img: Image, x: number, y: number) => (y * img.width + x) * 4;
const opaque = (img: Image, x: number, y: number) =>
  x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[px(img, x, y) + 3] >= 128;
function put(img: Image, x: number, y: number, rgb: readonly number[], a = 255) {
  const i = px(img, x, y);
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
  img.data[i + 3] = a;
}
/** Blend a colour over a pixel (a soft shadow). */
function tint(img: Image, x: number, y: number, rgb: readonly number[], a: number) {
  const i = px(img, x, y);
  const t = a / 255;
  const base = img.data[i + 3] / 255;
  const out = t + base * (1 - t);
  for (let c = 0; c < 3; c++)
    img.data[i + c] = Math.round((rgb[c] * t + img.data[i + c] * base * (1 - t)) / (out || 1));
  img.data[i + 3] = Math.round(out * 255);
}

// --- The cave mouth ---------------------------------------------------------------------------------------------------
const W = 128;
const BODY = 75; // the rock's height; the rows under it hold the shadow
const H = BODY + 8;

function caveMouth(): Image {
  const out = blank(W, H);
  const mouth = crop(SRC, 32, 160, 64, BODY);
  const lip = crop(SRC, 36, 160, 28, 11); // the tan top, tiled across the flanks
  const faces = [crop(SRC, 36, 80, 32, 32), crop(SRC, 36, 106, 32, 32)];
  // Flanks: tan lip, then face rock, in the mouth's own palette.
  for (const x0 of [0, 96]) {
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < BODY; y++) {
        const src = y < 11 ? lip : faces[y < 42 ? 0 : 1];
        const sx = (x0 === 0 ? x : 31 - x) % src.width;
        const sy = y < 11 ? y : Math.min(src.height - 1, y < 42 ? y - 11 : y - 42);
        const i = px(src, sx, sy);
        if (src.data[i + 3] < 128) continue;
        out.data.set(src.data.subarray(i, i + 4), px(out, x0 + x, y));
      }
    }
  }
  // Shape the mound: round the outer top corners and the feet, then re-outline.
  const R = 24;
  for (let y = 0; y < BODY; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= 32 && x < 96) continue;
      const d = Math.min(x, W - 1 - x); // distance from the outer edge
      const top = d < R ? R - Math.sqrt(R * R - (R - d) * (R - d)) : 0;
      const foot = d < 6 ? 6 - Math.sqrt(36 - (6 - d) * (6 - d)) : 0;
      if (y < top || y > BODY - 1 - foot) out.data[px(out, x, y) + 3] = 0;
    }
  }
  over(out, mouth, 32, 0);
  // Outline: every opaque pixel next to nothing (outside the mound) takes the outline colour.
  const edge: [number, number][] = [];
  for (let y = 0; y < BODY; y++)
    for (let x = 0; x < W; x++)
      if (
        opaque(out, x, y) &&
        (x === 0 || x === W - 1 || !opaque(out, x - 1, y) || !opaque(out, x + 1, y) || !opaque(out, x, y - 1))
      )
        edge.push([x, y]);
  for (const [x, y] of edge) if (y < BODY - 2) put(out, x, y, OUTLINE);
  // Light from the north-west: lift the top, darken the foot a little.
  for (let y = 0; y < BODY; y++) {
    for (let x = 0; x < W; x++) {
      if (!opaque(out, x, y) || (x >= 36 && x < 92 && y >= 20)) continue;
      const k = y < 14 ? 1.06 : y > BODY - 14 ? 0.8 + 0.2 * ((BODY - 1 - y) / 14) : 1;
      for (let c = 0; c < 3; c++)
        out.data[px(out, x, y) + c] = Math.min(255, Math.round(out.data[px(out, x, y) + c] * k));
    }
  }
  // Foot: sand drifts frayed over the rock's base and a soft shadow on the ground in front.
  for (let y = BODY - 5; y < BODY; y++) {
    for (let x = 0; x < W; x++) {
      if (!opaque(out, x, y)) continue;
      if (hash(x, y, 4) < 0.62 - (BODY - 1 - y) * 0.11) put(out, x, y, SAND[Math.floor(hash(x, y, 9) * 3)]);
    }
  }
  for (let y = BODY - 3; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - (W - 1) / 2) / (W / 2 - 2);
      const ny = (y - (BODY - 3)) / (H - BODY + 3);
      const e = 1 - nx * nx - ny * ny * 1.6;
      if (e <= 0 || opaque(out, x, y)) continue;
      tint(out, x, y, [90, 52, 34], Math.round(Math.min(1, e * 2.2) * 70));
    }
  }
  return out;
}

// --- The sewer hatch --------------------------------------------------------------------------------------------------
function hatch(): Image {
  const out = blank(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const nx = (x - 15.5) / 15.5;
      const ny = (y - 17) / 14;
      const e = 1 - (nx * nx + ny * ny);
      if (e > 0) tint(out, x, y, [40, 30, 36], Math.round(Math.min(1, e * 4) * 60));
    }
  }
  over(out, crop(SEWER, 256, 32, 28, 28), 2, 2);
  return out;
}

const pieces = [caveMouth(), hatch()];
const sheet = blank(W + 32, H);
over(sheet, pieces[0], 0, 0);
// `over` skips translucent-free logic only for fully transparent pixels, so shadows survive.
over(sheet, pieces[1], W, 0);
writePng(path.join(ROOT, 'public/tilesets/entrances.png'), sheet);
console.log(`wrote entrances.png (${pieces.length} pieces)`);
