// Builds public/tilesets/town.png: the shop buildings, composed from the LPC "City outside" pack (Reemax, Hyptosis, Guido Bos,
// Sharm and others, CC-BY-SA 3.0 / GPL 3.0; art/lpc_city/). The pack is drawn on the map's own 32px grid, so pieces are
// cut and placed pixel for pixel, with no recolouring (the pack's two roofs and two walls keep the palette of the terrain,
// trees and characters). Every building is the pack's gable (made shallower, see `shallower`) over a stone or brick wall
// with a shadow under the eave, a brick chimney, a door on the ground line and windows; halls are 5 cells wide with a
// one-cell door and a dormer in each slope, houses are 3 wide with a window in the gable end. A shop's trade is told by
// the hanging sign beside its door (SIGN_PREFABS in catalog.ts), not by colour.
// Run with `npm run tilesets`; the output is committed. Coordinates of each building are in catalog.ts (BUILDINGS).

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { blank, crop, over, tiled } from './compose';
import { BUILDINGS } from './catalog';

const SRC = readPng(path.join(ROOT, 'art/lpc_city/city_outside.png'));
const OUT = path.join(ROOT, 'public/tilesets/town.png');

/** A rectangle of the pack as an image of its own. */
function cut(x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++)
    SRC.data.copy(out.data, yy * w * 4, ((y + yy) * SRC.width + x) * 4, ((y + yy) * SRC.width + x + w) * 4);
  return out;
}

// Pieces of the pack (source pixels). A gable is 160 wide and 160 high; walls have a body that repeats and a base.
const GABLE = { slate: cut(0, 224, 160, 160), red: cut(288, 224, 160, 160) };
// The slate gable's cut has a fragment of the next tile (a dark triangle) in its top right corner.
for (let y = 0; y < 40; y++) for (let x = 128; x < 160; x++) GABLE.slate.data[(y * 160 + x) * 4 + 3] = 0;
const WALL = {
  stone: { body: cut(448, 288, 96, 64), base: cut(448, 352, 96, 32) },
  brick: { body: cut(192, 96, 96, 64), base: cut(192, 160, 96, 32) },
};
const WINDOW = cut(640, 32, 32, 32); // dark panes with a flower box
const PANES = cut(640, 0, 32, 32); // the same window without the box
const DOOR = cut(704, 16, 32, 48);
const CHIMNEY = cut(514, 387, 28, 29); // red brick, stands on the roof

type Roof = keyof typeof GABLE;
type Wall = keyof typeof WALL;

/** A wall `w` x `h` standing on the ground line: the body tiled above, the base under it. */
function wall(kind: Wall, w: number, h: number): Image {
  const { body, base } = WALL[kind];
  const out = blank(w, h);
  over(out, tiled(body, w, h - base.height), 0, 0);
  over(out, tiled(base, w, base.height), 0, h - base.height);
  return out;
}

const alphaAt = (img: Image, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

/**
 * `roof` made `cut` pixels shallower: in every pixel column the middle of its opaque run is dropped, so both outlines (the
 * sloped top and the sloped eave) stay exactly as drawn and only the plain tiles between them shrink.
 */
function shallower(roof: Image, cut: number): Image {
  const out = blank(roof.width, roof.height);
  for (let x = 0; x < roof.width; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < roof.height; y++)
      if (alphaAt(roof, x, y) > 0) {
        if (top < 0) top = y;
        bottom = y;
      }
    if (top < 0) continue;
    const keep = Math.max(bottom - top + 1 - cut, 8);
    const above = Math.floor(keep / 2);
    for (let k = 0; k < keep; k++) {
      const sy = k < above ? top + k : bottom - (keep - 1 - k);
      roof.data.copy(
        out.data,
        (k + top) * out.width * 4 + x * 4,
        (sy * roof.width + x) * 4,
        (sy * roof.width + x) * 4 + 4,
      );
    }
  }
  return out;
}

/** The pixels of `img` in a column darkened by `amount` (0..1), for rows y0..y1. */
function shade(img: Image, x: number, y0: number, y1: number, amount: number) {
  for (let y = y0; y <= y1; y++) {
    const i = (y * img.width + x) * 4;
    if (img.data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c] * (1 - amount));
  }
}

/** The highest opaque row of column `x`, or -1. */
function highest(img: Image, x: number): number {
  for (let y = 0; y < img.height; y++) if (alphaAt(img, x, y) > 0) return y;
  return -1;
}

/** The lowest opaque row of column `x` (the eave), or -1. */
function lowest(img: Image, x: number): number {
  for (let y = img.height - 1; y >= 0; y--) if (alphaAt(img, x, y) > 0) return y;
  return -1;
}

/**
 * A gabled front, `w` wide (96 or 160) and `h` high: the pack's gable (made shallower) over the wall, a shadow under the
 * eave, a window in the gable end, a door in the middle of the ground floor and (in a hall) a window each side of it.
 */
function front(roofKind: Roof, kind: Wall, w: number, h: number): Image {
  const out = blank(w, h);
  const base = WALL[kind].base.height;
  const x0 = (GABLE[roofKind].width - w) / 2;
  const roof = shallower(crop(GABLE[roofKind], x0, 0, w, 160), 36);
  const wallTop = 56;
  over(out, wall(kind, w, h - wallTop), 0, wallTop);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < highest(roof, x); y++) out.data[(y * w + x) * 4 + 3] = 0; // no wall outside the roof's outline
    const e = lowest(roof, x);
    if (e >= 0) shade(out, x, e + 1, e + 7, 0.4);
  }
  over(out, roof, 0, 0);
  const chimneyX = Math.round(w * 0.62);
  over(out, CHIMNEY, chimneyX, highest(roof, chimneyX + 14) - 8); // standing on the right slope
  if (w > 96)
    for (const x of [14, w - 46]) {
      // A dormer in each slope: a window under a small peak cut from the gable's own ridge.
      over(out, PANES, x, 62);
      over(out, crop(GABLE[roofKind], 64, 0, 32, 18), x, 46);
    }
  const doorX = (w - DOOR.width) / 2;
  over(out, DOOR, doorX, h - DOOR.height - 2); // the door stands on the ground line, over the plinth
  if (w === 96) over(out, PANES, doorX, h - base - DOOR.height - 40); // a house's gable-end window, above the door
  if (w > 96) for (const x of [16, w - 48]) over(out, WINDOW, x, h - base - 36);
  return out;
}

const pieces: Record<keyof typeof BUILDINGS, Image> = {
  smithy: front('red', 'stone', 160, 224),
  armory: front('slate', 'stone', 96, 288),
  apothecary: front('red', 'brick', 160, 224),
  ranger: front('red', 'stone', 96, 288),
  wizard: front('slate', 'brick', 160, 224),
  tavern: front('red', 'brick', 160, 224),
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
