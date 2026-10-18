// Builds public/tilesets/town.png: the shop buildings, composed from the LPC "City outside" pack (Reemax, Hyptosis, Guido Bos,
// Sharm and others, CC-BY-SA 3.0 / GPL 3.0; art/lpc_city/). The pack is drawn on the map's own 32px grid, so pieces are
// cut and placed pixel for pixel, with no recolouring (the pack's two roofs and two walls keep the palette of the terrain,
// trees and characters). Every building is a gabled front: the pack's gable (both slopes, a dark side face) over a wall with
// windows and a door. Four halls are 5 cells wide (one-cell door in the middle), two houses are 3 wide. A shop's trade is
// told by the hanging sign beside its door (SIGN_PREFABS in catalog.ts), not by colour.
// Run with `npm run tilesets`; the output is committed. Coordinates of each building are in catalog.ts (BUILDINGS).

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { BUILDINGS } from './catalog';

const SRC = readPng(path.join(ROOT, 'art/lpc_city/city_outside.png'));
const OUT = path.join(ROOT, 'public/tilesets/town.png');

const blank = (width: number, height: number): Image => ({ width, height, data: Buffer.alloc(width * height * 4) });

/** A rectangle of the pack as an image of its own. */
function cut(x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++)
    SRC.data.copy(out.data, yy * w * 4, ((y + yy) * SRC.width + x) * 4, ((y + yy) * SRC.width + x + w) * 4);
  return out;
}

/** A rectangle of `img` as an image of its own. */
function crop(img: Image, x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++)
    img.data.copy(out.data, yy * w * 4, ((y + yy) * img.width + x) * 4, ((y + yy) * img.width + x + w) * 4);
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

/**
 * A gabled front, `w` wide (96 or 160) and `h` high: the wall from y 100 down, the gable's middle `w` pixels over it, a
 * door in the middle of the ground floor, a window above it and (in a hall) a window each side of the door.
 */
function front(roof: Roof, kind: Wall, w: number, h: number): Image {
  const out = blank(w, h);
  const base = WALL[kind].base.height;
  over(out, wall(kind, w, h - 100), 0, 100);
  const x0 = (GABLE[roof].width - w) / 2;
  over(out, crop(GABLE[roof], x0, 0, w, 160), 0, 0);
  const doorX = (w - DOOR.width) / 2;
  const wallY = h - base - DOOR.height + 6; // where the windows sit: a door's height above the plinth
  over(out, DOOR, doorX, h - DOOR.height - 2); // the door stands on the ground line, over the plinth
  over(out, PANES, doorX, wallY - 48);
  if (w > 96) for (const x of [16, w - 48]) over(out, WINDOW, x, wallY + 8);
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
