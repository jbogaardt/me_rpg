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
  flat(32, 30, 46), // roof: the dark above the walls (delve_fx.png roughens it)
  gloom(crop(WALLS, 0, 192, CELL, CELL), WALL), // cap top: the crenelled rim over the first bricks
  gloom(crop(WALLS, 52, 208, CELL, CELL), WALL), // cap
  gloom(crop(WALLS, 52, 236, CELL, CELL), WALL), // face, upper row
  gloom(crop(WALLS, 0, 280, CELL, CELL), WALL), // face, lower row: the bricks' foot, a dentil course against the floor
];

/** `img` mirrored left-right (`h`) and/or top-bottom (`v`): a floor tile turned over, so the cobbles do not repeat in a grid. */
function flip(img: Image, h: boolean, v: boolean): Image {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const from = ((v ? img.height - 1 - y : y) * img.width + (h ? img.width - 1 - x : x)) * 4;
      img.data.copy(out.data, (y * img.width + x) * 4, from, from + 4);
    }
  return out;
}

const sheet = blank(CELL * 10, 128);
ground.forEach((cell, i) => over(sheet, cell, i * CELL, 0));
// Floor variants (y 96, `SEWER_FLOORS` in delve.ts picks by a hash of the cell): A turned four ways, B and the mossy C two.
[
  ground[0],
  flip(ground[0], true, false),
  flip(ground[0], false, true),
  flip(ground[0], true, true),
  ground[1],
  flip(ground[1], true, true),
  ground[2],
  flip(ground[2], true, false),
].forEach((cell, i) => over(sheet, cell, i * CELL, 96));
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
/** A stone arch opening `w` x `h` with a lighter frame, over two cells of wall. The opening has depth: a lit lip and jamb, a dark vault, and stairs (or a drain's green glint behind bars) going away. */
function archway(w: number, h: number, bars = false): Image {
  const img = blank(w, h);
  for (let y = 0; y < h; y += CELL) for (let x = 0; x < w; x += CELL) over(img, STONE, x, y);
  const [x0, y0, ow, oh] = [4, 8, w - 8, h - 8];
  rect(img, x0 - 2, y0 - 2, ow + 4, oh + 2, [98, 104, 108]); // frame
  rect(img, x0, y0, ow, oh, DARK);
  // The vault: darkest at the top, a touch of cool light coming up from the floor.
  const steps: [number, [number, number, number]][] = [
    [0, [7, 6, 12]],
    [Math.floor(oh * 0.4), [11, 10, 18]],
    [Math.floor(oh * 0.65), [16, 17, 27]],
    [Math.floor(oh * 0.82), [22, 26, 38]],
  ];
  for (const [dy, c] of steps) rect(img, x0, y0 + dy, ow, oh - dy, c);
  rect(img, x0, y0, ow, 2, [3, 3, 8]); // the shadow under the lintel
  rect(img, x0, y0 + 2, 2, oh - 2, [30, 32, 44]); // the lit jamb on the left
  rect(img, x0 + ow - 2, y0 + 2, 2, oh - 2, [4, 4, 9]); // the shaded jamb on the right
  rect(img, x0 + 2, y0 + 2, ow - 4, 1, [58, 62, 78]); // the lip of the vault, catching light
  if (!bars) {
    // Steps going down into the dark: each tread a lighter line over a darker riser, narrowing with distance.
    for (let i = 0; i < 3; i++) {
      const y = y0 + oh - 5 - i * 4;
      const inset = 2 + i * 2;
      rect(img, x0 + inset, y, ow - inset * 2, 1, [70 - i * 18, 76 - i * 18, 98 - i * 20]);
      rect(img, x0 + inset, y + 1, ow - inset * 2, 3, [26 - i * 6, 28 - i * 6, 40 - i * 8]);
    }
  }
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
    // Behind the bars the dark thins to a murky glint of water.
    rect(img, x0 + 2, y0 + oh - 9, ow - 4, 7, [20, 34, 28]);
    for (let x = x0 + 4; x < x0 + ow - 3; x += 7) rect(img, x, y0 + oh - 7 + ((x >> 2) % 3), 3, 1, [92, 146, 108]);
    const iron: [number, number, number] = [74, 82, 90];
    for (let x = x0 + 2; x < x0 + ow - 1; x += 5) {
      rect(img, x, y0 + 2, 2, oh - 2, iron);
      rect(img, x, y0 + 2, 1, oh - 2, [96, 106, 114]); // each bar lit on its left
    }
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

writePng(path.join(ROOT, 'public/tilesets/sewer_lpc.png'), sheet);
console.log('wrote sewer_lpc.png');
