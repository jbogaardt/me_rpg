// Builds public/tilesets/rock_cave.png: the ground tiles of the rock cave theme (delve.ts, `DELVE_THEMES.rock`), cut from the
// LPC base assets' mountains (art/lpc_mountains/, see CREDITS.md): a dark void (the roof), the tan lip where it meets the rock,
// the brown rock face in two rows, and earthen cobble floors (the plateau's tan, browned). A cave in this style reads as a dark hollow in brown rock, like the
// plateaus of `z.plateau(kind: 'rock')`. Cells are 32px, in one row: floor A, B, C, roof, edge, face (upper), face (lower).
// Run with `npm run tilesets`; the output is committed. The catalog (`dungeonGrounds`) names the cells by index.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { blank, crop, over } from './compose';

const SRC = readPng(path.join(ROOT, 'art/lpc_mountains/mountains.png'));
const CELL = 32;

/** The void's colour, read from the middle of the pit in the sheet. */
const dark = (): Buffer => {
  const i = (45 * SRC.width + 50) * 4;
  return Buffer.from([SRC.data[i], SRC.data[i + 1], SRC.data[i + 2], 255]);
};

/** The cobble darkened and browned, so a cave's floor is earth and a raised plateau's tan cobble stands out from it. */
function earthen(tile: Image): Image {
  const out = { ...tile, data: Buffer.from(tile.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = Math.round(out.data[i] * 0.74);
    out.data[i + 1] = Math.round(out.data[i + 1] * 0.66);
    out.data[i + 2] = Math.round(out.data[i + 2] * 0.6);
  }
  return out;
}

const cells = [
  earthen(crop(SRC, 192, 20, CELL, CELL)), // floor A: cobble from the plateau top (windows that hold no outline pixel)
  earthen(crop(SRC, 196, 30, CELL, CELL)), // floor B
  earthen(crop(SRC, 188, 26, CELL, CELL)), // floor C
  (() => {
    const c = blank(CELL, CELL);
    const d = dark();
    for (let i = 0; i < c.data.length; i += 4) d.copy(c.data, i);
    return c;
  })(), // roof: the void
  crop(SRC, 36, 56, CELL, CELL), // edge: void above the tan lip, brown rock below it
  crop(SRC, 36, 80, CELL, CELL), // face, upper row
  crop(SRC, 36, 106, CELL, CELL), // face, lower row (ends in the rock's foot)
];

const sheet = blank(CELL * cells.length, CELL);
cells.forEach((cell, i) => over(sheet, cell, i * CELL, 0));
writePng(path.join(ROOT, 'public/tilesets/rock_cave.png'), sheet);
console.log(`wrote rock_cave.png (${cells.length} tiles)`);
