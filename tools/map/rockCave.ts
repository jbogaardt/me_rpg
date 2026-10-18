// Builds public/tilesets/rock_cave.png: the ground tiles of the rock cave theme (delve.ts, `DELVE_THEMES.rock`), cut from the
// LPC base assets' mountains (art/lpc_mountains/, see CREDITS.md): a dark void (the roof), the tan lip where it meets the rock,
// the brown rock face in two rows, and earthen cobble floors (the plateau's tan, browned). A cave in this style reads as a dark hollow in brown rock, like the
// plateaus of `z.plateau(kind: 'rock')`. Cells are 32px, in one row: floor A, B, C, roof, edge, face (upper), face (lower), shaded floor, face (third row), grainy roof.
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

/** Every pixel's colour scaled by `k(y)` per channel (a shade down the tile, a lift toward the top of a wall). */
function shaded(tile: Image, k: (y: number) => number): Image {
  const out = { ...tile, data: Buffer.from(tile.data) };
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.min(255, Math.round(out.data[i + c] * k(y)));
    }
  }
  return out;
}

/** The tile mirrored left to right (a second face row that does not repeat the first's stripes). */
function mirrored(tile: Image): Image {
  const out = { ...tile, data: Buffer.from(tile.data) };
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      tile.data.copy(
        out.data,
        (y * tile.width + x) * 4,
        (y * tile.width + (tile.width - 1 - x)) * 4,
        (y * tile.width + (tile.width - x)) * 4,
      );
    }
  }
  return out;
}

/** The void with a few rock-grain specks, so a thick wall's roof is a mass and not a flat fill. */
function speckled(base: Image): Image {
  const out = { ...base, data: Buffer.from(base.data) };
  for (let n = 0; n < 14; n++) {
    const x = (n * 11 + 5) % CELL;
    const y = (n * 19 + 3) % CELL;
    for (const dx of [0, 1]) {
      const i = (y * CELL + ((x + dx) % CELL)) * 4;
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.min(255, out.data[i + c] + 14);
    }
  }
  return out;
}

const roof = (() => {
  const c = blank(CELL, CELL);
  const d = dark();
  for (let i = 0; i < c.data.length; i += 4) d.copy(c.data, i);
  return c;
})();
const earthFloor = earthen(crop(SRC, 192, 20, CELL, CELL));
const faceU = crop(SRC, 36, 80, CELL, CELL);

const cells = [
  earthen(crop(SRC, 192, 20, CELL, CELL)), // floor A: cobble from the plateau top (windows that hold no outline pixel)
  earthen(crop(SRC, 196, 30, CELL, CELL)), // floor B
  earthen(crop(SRC, 188, 26, CELL, CELL)), // floor C
  roof, // roof: the void
  crop(SRC, 36, 56, CELL, CELL), // edge: void above the tan lip, brown rock below it
  crop(SRC, 36, 80, CELL, CELL), // face, upper row
  crop(SRC, 36, 106, CELL, CELL), // face, lower row (ends in the rock's foot)
  shaded(earthFloor, (y) => 0.62 + 0.38 * (y / (CELL - 1))), // floor in the wall's contact shadow (the row south of a wall)
  shaded(mirrored(faceU), () => 1.1), // face, third row: mirrored and lit, where the wall catches the light
  speckled(roof), // roof B: the void with grain (the dark top of a thick wall)
];

const sheet = blank(CELL * cells.length, CELL);
cells.forEach((cell, i) => over(sheet, cell, i * CELL, 0));
writePng(path.join(ROOT, 'public/tilesets/rock_cave.png'), sheet);
console.log(`wrote rock_cave.png (${cells.length} tiles)`);
