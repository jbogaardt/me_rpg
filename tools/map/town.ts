// Builds public/tilesets/town.png: the shop buildings, composed from the LPC "City outside" pack (Reemax, Hyptosis, Guido Bos,
// Sharm and others, CC-BY-SA 3.0 / GPL 3.0; art/lpc_city/). The pack is drawn on the map's own 32px grid, so pieces are
// cut and placed pixel for pixel. Four wide halls (smithy, apothecary, wizard, tavern) are a flat roof over a wall with
// windows and a double door; two narrow houses (armory, ranger) are a gable over a wall with one door. Roofs are recoloured
// so each trade has its own colour; a shop's sign is the hanging board beside its door (SIGN_PREFABS in catalog.ts).
// Run with `npm run tilesets`; the output is committed. Coordinates of each building are in catalog.ts (BUILDINGS).

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { BUILDINGS } from './catalog';

const SRC = readPng(path.join(ROOT, 'art/lpc_city/city_outside.png'));
const OUT = path.join(ROOT, 'public/tilesets/town.png');

type RGB = [number, number, number];

const blank = (width: number, height: number): Image => ({ width, height, data: Buffer.alloc(width * height * 4) });

/** A rectangle of the pack as an image of its own. */
function cut(x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++)
    SRC.data.copy(out.data, yy * w * 4, ((y + yy) * SRC.width + x) * 4, ((y + yy) * SRC.width + x + w) * 4);
  return out;
}

/** Draw the opaque pixels of `src` over `dst` at (dx, dy). */
function over(dst: Image, src: Image, dx: number, dy: number) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] === 0) continue;
      src.data.copy(dst.data, (ty * dst.width + tx) * 4, i, i + 4);
    }
}

/** `piece` repeated across w x h. */
function tiled(piece: Image, w: number, h: number): Image {
  const out = blank(w, h);
  for (let y = 0; y < h; y += piece.height) for (let x = 0; x < w; x += piece.width) over(out, piece, x, y);
  return out;
}

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** `img` with every hue turned by `turn` degrees and saturation scaled by `sat`. */
function recoloured(img: Image, turn: number, sat: number): Image {
  const out = { ...img, data: Buffer.from(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const [h, s, l] = toHsl([out.data[i]!, out.data[i + 1]!, out.data[i + 2]!]);
    const [r, g, b] = fromHsl(h + turn, Math.min(1, s * sat), l);
    out.data[i] = Math.round(r);
    out.data[i + 1] = Math.round(g);
    out.data[i + 2] = Math.round(b);
  }
  return out;
}

// Pieces of the pack (source pixels). Roof tiles are 96x96 and repeat sideways; walls have a body that repeats and a base.
const ROOF = { red: cut(96, 128, 96, 96), slate: cut(0, 128, 96, 96) };
const WALL = {
  tan: { body: cut(576, 192, 96, 80), base: cut(576, 272, 96, 16) },
  stone: { body: cut(448, 288, 96, 64), base: cut(448, 352, 96, 32) },
  brick: { body: cut(192, 96, 96, 64), base: cut(192, 160, 96, 32) },
};
const GABLE = { slate: cut(32, 224, 96, 160), red: cut(320, 224, 96, 160) }; // the middle 96px of each 160px gable
const WINDOW = cut(640, 32, 32, 32); // dark panes with a flower box
const DOUBLE_DOOR = cut(672, 16, 64, 48);
const SINGLE_DOOR = cut(704, 16, 32, 48);

type Wall = keyof typeof WALL;

/** A wall `w` x `h` standing on the ground line: the body tiled above, the base under it. */
function wall(kind: Wall, w: number, h: number): Image {
  const { body, base } = WALL[kind];
  const out = blank(w, h);
  over(out, tiled(body, w, h - base.height), 0, 0);
  over(out, tiled(base, w, base.height), 0, h - base.height);
  return out;
}

/** A wide hall, 192x224: a flat roof (96 high), then the wall with two windows and a double door at x 64-128. */
function hall(roof: Image, kind: Wall): Image {
  const out = blank(192, 224);
  over(out, wall(kind, 192, 128), 0, 96);
  const base = WALL[kind].base.height;
  over(out, DOUBLE_DOOR, 64, 224 - base - 48 + 6);
  for (const x of [16, 144]) over(out, WINDOW, x, 112);
  over(out, tiled(roof, 192, 96), 0, 0);
  return out;
}

/** A narrow house, 96x288: a gable roof over a wall with a window above a single door at x 32-64. */
function house(gable: Image, kind: Wall): Image {
  const out = blank(96, 288);
  const base = WALL[kind].base.height;
  over(out, wall(kind, 96, 176), 0, 112);
  over(out, SINGLE_DOOR, 32, 288 - base - 48 + 6);
  over(out, WINDOW, 32, 288 - base - 48 + 6 - 48);
  over(out, gable, 0, 0);
  return out;
}

const pieces: Record<keyof typeof BUILDINGS, Image> = {
  smithy: hall(ROOF.red, 'tan'), // the pack's own red roof
  apothecary: hall(recoloured(ROOF.red, 100, 0.6), 'tan'), // mossy green
  wizard: hall(recoloured(ROOF.slate, 40, 1.8), 'stone'), // violet slate
  tavern: hall(recoloured(ROOF.slate, 0, 1), 'brick'), // the pack's blue-grey roof over red brick
  armory: house(GABLE.slate, 'stone'),
  ranger: house(recoloured(GABLE.red, 28, 0.9), 'brick'), // golden-brown
};

const width = Object.values(BUILDINGS).reduce((sum, b) => sum + b.w, 0);
const height = Math.max(...Object.values(BUILDINGS).map((b) => b.h));
const sheet = blank(width, height);
for (const [name, b] of Object.entries(BUILDINGS)) {
  const img = pieces[name as keyof typeof BUILDINGS];
  if (img.width !== b.w || img.height !== b.h)
    throw new Error(`${name}: drew ${img.width}x${img.height}, catalog says ${b.w}x${b.h}`);
  over(sheet, img, b.x, b.y);
}
writePng(OUT, sheet);
console.log(`wrote town.png (${width}x${height})`);
