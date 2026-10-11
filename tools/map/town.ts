// Builds public/tilesets/town.png: the shop buildings, cut from the CC0 "Town RPG Pack" by Luis Zuno (ansimuz) in
// art/town_rpg_pack/. The pack is drawn on a 16px grid and the map on a 32px one, so every piece is doubled
// (nearest neighbour). The pack has one big inn and one tall house, so each is cut out and turned into two shops: the
// roof is recoloured, the tall house gets the inn's door (it has none), and a small emblem replaces the "INN" sign.
// Run with `npm run tilesets`; the output is committed. Coordinates of each building are in catalog.ts (BUILDINGS).

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { BUILDINGS } from './catalog';

const SRC = readPng(path.join(ROOT, 'art/town_rpg_pack/transparent-bg-tiles.png'));
const OUT = path.join(ROOT, 'public/tilesets/town.png');

type RGB = [number, number, number];

const blank = (width: number, height: number): Image => ({ width, height, data: Buffer.alloc(width * height * 4) });

/** Copy the opaque pixels of a rect of `from` onto `to` at (dx, dy). */
function blit(to: Image, from: Image, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((sy + y) * from.width + sx + x) * 4;
      if (from.data[i + 3] === 0) continue;
      const j = ((dy + y) * to.width + dx + x) * 4;
      from.data.copy(to.data, j, i, i + 4);
    }
  }
}

function setPixel(img: Image, x: number, y: number, [r, g, b]: RGB) {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = 255;
}

function getPixel(img: Image, x: number, y: number): RGB {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
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

/** Recolour the roof: the warm tiles (red-brown and orange, including the dark ones) in rows y0..y1 get a new hue. */
function recolorRoof(img: Image, y0: number, y1: number, hue: number, sat: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] === 0) continue;
      const [h, s, l] = toHsl(getPixel(img, x, y));
      if (s < 0.15 || !(h < 50 || h > 300)) continue; // walls are green-grey, the dark gable is green
      const [r, g, b] = fromHsl(hue + (h > 300 ? h - 360 : h) * 0.3, Math.min(1, s * sat), l);
      setPixel(img, x, y, [Math.round(r), Math.round(g), Math.round(b)]);
    }
  }
}

import { ACCENT, EMBLEMS, INK, LIGHT } from './emblems';

/** Paint an emblem into the awning strip of a door (23x7 px at (x, y)), replacing the inn's red stripes. */
function paintEmblem(img: Image, x: number, y: number, w: number, h: number, name: string, back = LIGHT, ink = INK) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, back);
  const rows = EMBLEMS[name];
  if (!rows) throw new Error(`No emblem for ${name}`);
  const ox = x + Math.floor((w - 8) / 2);
  const oy = y + Math.floor((h - rows.length) / 2);
  rows.forEach((row, j) =>
    [...row].forEach((c, i) => {
      if (c === '#' || c === 'o') setPixel(img, ox + i, oy + j, c === '#' ? ink : back);
      else if (c === 'x' || c === '>') setPixel(img, ox + i, oy + j, ink === INK ? (ACCENT[name] ?? INK) : ink);
    }),
  );
}

// Source rects in the pack (1x pixels). The hall's door sits at x 176-207; its awning is the 23x7 strip above the door.
const HALL = { x: 144, y: 10, w: 96, h: 108 }; // the inn: roof rows y 10-47, wall below, porch step at the bottom
const TOWER = { x: 288, y: 12, w: 48, h: 132 }; // the tall house (no door of its own)
const DOOR = { x: 176, y: 80, w: 32, h: 38 }; // door, posts and awning (rows 0-31) plus the step (rows 32-37)
const AWNING = { x: 180, y: 81, w: 23, h: 7 }; // inside DOOR's region, source coordinates

function hall(name: string, hue: number, sat: number): Image {
  const img = blank(96, 112);
  blit(img, SRC, HALL.x, HALL.y, HALL.w, HALL.h, 0, 4);
  recolorRoof(img, 4, 42, hue, sat);
  paintEmblem(img, AWNING.x - HALL.x, AWNING.y - HALL.y + 4, AWNING.w, AWNING.h, name);
  // The hanging "INN" board beside the door: wipe the letters and show the emblem again, light on wood.
  const board = { x: 157 - HALL.x, y: 89 - HALL.y + 4, w: 10, h: 6 };
  paintEmblem(img, board.x, board.y, board.w, board.h, name, [150, 112, 80], LIGHT);
  return img;
}

function tower(name: string, hue: number, sat: number): Image {
  const img = blank(48, 144);
  blit(img, SRC, TOWER.x, TOWER.y, TOWER.w, TOWER.h, 0, 6);
  // Replace the ground-floor window with the inn's door: its wall ends where the tower's does (row 138).
  blit(img, SRC, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 8, 138 - 32);
  recolorRoof(img, 6, 73, hue, sat);
  paintEmblem(img, 8 + AWNING.x - DOOR.x, 106 + AWNING.y - DOOR.y, AWNING.w, AWNING.h, name);
  return img;
}

const pieces: Record<keyof typeof BUILDINGS, Image> = {
  smithy: hall('smithy', 14, 1), // the inn's own terracotta
  apothecary: hall('apothecary', 135, 0.55), // mossy green
  armory: tower('armory', 215, 0.3), // slate
  ranger: tower('ranger', 40, 0.85), // golden thatch
};

const width = Object.values(BUILDINGS).reduce((sum, b) => sum + b.w, 0);
const height = Math.max(...Object.values(BUILDINGS).map((b) => b.h));
const sheet = blank(width, height);
for (const [name, b] of Object.entries(BUILDINGS)) {
  const img = pieces[name as keyof typeof BUILDINGS];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = (Math.floor(y / 2) * img.width + Math.floor(x / 2)) * 4;
      if (img.data[i + 3] === 0) continue;
      img.data.copy(sheet.data, ((b.y + y) * width + b.x + x) * 4, i, i + 4);
    }
  }
}
writePng(OUT, sheet);
console.log(`wrote town.png (${width}x${height})`);
