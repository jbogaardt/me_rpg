// Builds the cave, sewer and desert-cliff sheets (public/tilesets/dungeon_cave.png, dungeon_sewer.png, dunes.png) from
// the OpenGameArt tilesets in art/oga_dungeon/ (MrBeast, CC-BY 3.0, see CREDITS.txt). The art is on a 16px tile grid;
// the map's cell is 32px, so each sheet is doubled (nearest neighbour, like the town and interior art), which keeps a
// source tile (tx, ty) at (tx * 32, ty * 32): the catalog (DUNGEON in catalog.ts) names tiles by those source indices.
// Run with `npm run tilesets`; the output is committed.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';

// The desert sheet's rocks stand on its own cream sand; the game's sand ground is a close match, so the sand is keyed
// out (every pixel lighter than the rock's palest tone) and a cliff piece sits on whatever ground the biome has.
const SAND_LUMA = 205;
const keySand = (img: Image) => {
  for (let i = 0; i < img.data.length; i += 4) {
    const luma = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2];
    if (img.data[i + 3] && luma >= SAND_LUMA) img.data.fill(0, i, i + 4);
  }
  return img;
};

const SHEETS = [
  ['cave.png', 'dungeon_cave.png', (img: Image) => img],
  ['sewer_1.png', 'dungeon_sewer.png', (img: Image) => img],
  ['desert_1.png', 'dunes.png', keySand],
] as const;

export function double(src: Image): Image {
  const out: Image = { width: src.width * 2, height: src.height * 2, data: Buffer.alloc(src.width * src.height * 16) };
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = ((y >> 1) * src.width + (x >> 1)) * 4;
      src.data.copy(out.data, (y * out.width + x) * 4, s, s + 4);
    }
  }
  return out;
}

for (const [from, to, prepare] of SHEETS) {
  writePng(path.join(ROOT, 'public/tilesets', to), prepare(double(readPng(path.join(ROOT, 'art/oga_dungeon', from)))));
}
