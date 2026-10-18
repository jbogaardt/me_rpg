// Builds public/tilesets/sewer_lpc.png: the ground tiles and props of the sewer theme (delve.ts `DELVE_THEMES.sewer`), cut from
// the LPC base assets in art/lpc_sewer/ (see CREDITS.md): a blue-grey cobble floor (one mossy), the castle's stone wall in its
// cap and face rows, murky green water made from the pack's water, and the props the sewers use (doorway, barred gate, grate,
// torch, barrel, bucket, drain). The stone is darkened so the sewer is gloomier than the town above it. Cells are 32px: row 0
// is ground (floor A B C, water A B, roof, cap top, cap, face upper, face lower); props follow from y 32, where `SEWER_ART` in
// catalog.ts names them. Run with `npm run tilesets`; the output is committed.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { blank, crop, over } from './compose';

const art = (f: string) => readPng(path.join(ROOT, 'art/lpc_sewer', f));
const WALLS = art('castlewalls.png');
const FLOORS = art('castlefloors.png');
const WATER = art('water.png');
const BARREL = art('barrel.png');
const BUCKETS = art('buckets.png');
const DUNGEON = art('dungeon.png');
const LIGHTS = art('castle_lightsources.png');
const CELL = 32;

/** Every colour of `img` scaled by `f` (opaque pixels only). */
function gloom(img: Image, f: number): Image {
  const out = { ...img, data: Buffer.from(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] * f);
  }
  return out;
}

/** The pack's blue water turned to murky green: brightness kept, hue moved to olive. */
function murky(img: Image): Image {
  const out = { ...img, data: Buffer.from(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const l = (0.3 * out.data[i] + 0.59 * out.data[i + 1] + 0.11 * out.data[i + 2]) / 255;
    out.data[i] = Math.round(34 + 70 * l);
    out.data[i + 1] = Math.round(52 + 96 * l);
    out.data[i + 2] = Math.round(30 + 40 * l);
  }
  return out;
}

const flat = (r: number, g: number, b: number): Image => {
  const c = blank(CELL, CELL);
  for (let i = 0; i < c.data.length; i += 4) c.data.set([r, g, b, 255], i);
  return c;
};

const WALL = 0.62;
const FLOOR = 0.82;
const ground = [
  gloom(crop(FLOORS, 160, 160, CELL, CELL), FLOOR), // floor A
  gloom(crop(FLOORS, 224, 160, CELL, CELL), FLOOR), // floor B
  gloom(crop(FLOORS, 192, 192, CELL, CELL), FLOOR), // floor C: the mossy one
  murky(crop(WATER, 0, 160, CELL, CELL)), // water A
  murky(crop(WATER, 32, 160, CELL, CELL)), // water B
  flat(22, 20, 30), // roof: the dark above the walls
  gloom(crop(WALLS, 0, 192, CELL, CELL), WALL), // cap top: the crenelled rim over the first bricks
  gloom(crop(WALLS, 52, 208, CELL, CELL), WALL), // cap
  gloom(crop(WALLS, 52, 236, CELL, CELL), WALL), // face, upper row
  gloom(crop(WALLS, 0, 280, CELL, CELL), WALL), // face, lower row: the bricks' foot, a dentil course against the floor
];

const sheet = blank(CELL * 10, 192);
ground.forEach((cell, i) => over(sheet, cell, i * CELL, 0));
const put = (img: Image, x: number, y: number) => over(sheet, img, x, y);

// --- Props (y 32): doorway 32x64 at x 0, gate 32x64 at 32, grate 96x64 at 64, torch, barrel, bucket, drain ---
const STONE = gloom(crop(WALLS, 52, 236, CELL, CELL), WALL);
const DARK: [number, number, number] = [10, 8, 14];
const rect = (img: Image, x: number, y: number, w: number, h: number, [r, g, b]: [number, number, number]) => {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (xx >= 0 && yy >= 0 && xx < img.width && yy < img.height)
        img.data.set([r, g, b, 255], (yy * img.width + xx) * 4);
};
/** A stone arch opening `w` x `h` with a lighter frame, over two cells of wall. */
function archway(w: number, h: number, bars = false): Image {
  const img = blank(w, h);
  for (let y = 0; y < h; y += CELL) for (let x = 0; x < w; x += CELL) over(img, STONE, x, y);
  const [x0, y0, ow, oh] = [4, 8, w - 8, h - 8];
  rect(img, x0 - 2, y0 - 2, ow + 4, oh + 2, [98, 104, 108]); // frame
  rect(img, x0, y0, ow, oh, DARK);
  for (const [dx, dy] of [
    [0, 0],
    [ow - 1, 0],
    [0, 1],
    [ow - 1, 1],
    [1, 0],
    [ow - 2, 0],
  ] as const)
    rect(img, x0 + dx, y0 + dy, 1, 1, [98, 104, 108]);
  if (bars) {
    const iron: [number, number, number] = [74, 82, 90];
    for (let x = x0 + 2; x < x0 + ow - 1; x += 5) rect(img, x, y0 + 2, 2, oh - 2, iron);
    rect(img, x0, y0 + 6, ow, 2, iron);
    rect(img, x0, y0 + oh - 10, ow, 2, iron);
  }
  return img;
}
put(archway(32, 64), 0, 32);
put(archway(32, 64, true), 32, 32);
{
  const g = archway(96, 64, true); // the grate: a wide barred outflow, with a green stain under it
  rect(g, 6, 52, 84, 6, [38, 62, 36]);
  put(g, 64, 32);
}
put(crop(LIGHTS, 66, 4, 28, 60), 160, 32 - 0); // torch: its stalk is taller than the cell, so it takes the cell below too
put(crop(BARREL, 1, 14, 31, 42), 192, 32);
put(crop(BUCKETS, 4, 6, 28, 24), 224, 32);
put(crop(DUNGEON, 388, 104, 28, 28), 256, 32);

// --- The stairwell (y 96): the way down from the market square, 96x96 = 3x3 cells. A brick facade with a crenelled cap, an
// arched dark opening and four steps going down into it. The bottom 12px of the middle cell stay empty, so only the two
// flanking wall cells are solid (catalog `sewerStairs`) and the way in is open. Torches (`sewerTorch`) hang on either side.
function stairwell(): Image {
  const img = blank(96, 96);
  const cap = gloom(crop(WALLS, 52, 208, CELL, CELL), WALL);
  const upper = gloom(crop(WALLS, 52, 236, CELL, CELL), WALL);
  const lower = gloom(crop(WALLS, 0, 280, CELL, CELL), WALL);
  for (let x = 0; x < 96; x += CELL) {
    over(img, cap, x, 0);
    over(img, upper, x, 32);
    over(img, lower, x, 64);
  }
  const [ox, oy, ow] = [26, 22, 44]; // the opening: x 26..70, y 22..84
  const FRAME: [number, number, number] = [112, 118, 122];
  const FRAME_DARK: [number, number, number] = [74, 80, 86];
  rect(img, ox - 3, oy - 3, ow + 6, 66, FRAME_DARK); // frame, shadow side
  rect(img, ox - 2, oy - 2, ow + 4, 64, FRAME);
  rect(img, ox, oy, ow, 62, DARK);
  // Steps down into the dark: each one lighter and wider toward the viewer, with a bright lip.
  const steps: [number, number][] = [
    [50, 52],
    [58, 60],
    [66, 68],
    [74, 76],
  ];
  steps.forEach(([y, c], i) => {
    const inset = 8 - i * 2;
    rect(img, ox + inset, oy + y - 22, ow - inset * 2, 8, [c, c + 4, c + 10]);
    rect(img, ox + inset, oy + y - 22, ow - inset * 2, 1, [c + 46, c + 50, c + 54]);
  });
  // The threshold: the bottom 12px of the middle cell are open ground.
  for (let y = 84; y < 96; y++) for (let x = 32; x < 64; x++) img.data.set([0, 0, 0, 0], (y * 96 + x) * 4);
  return img;
}
put(stairwell(), 0, 96);

writePng(path.join(ROOT, 'public/tilesets/sewer_lpc.png'), sheet);
console.log('wrote sewer_lpc.png');
