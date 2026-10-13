// Builds public/tilesets/crops.png: the crop plots (systems/crops.ts), cut from the "[LPC] Crops" sheet in
// art/lpc_crops/ (CC-BY-SA 3.0, see CREDITS.md). Each crop is one row of CROP_STAGES frames (sprout, two growing, ripe),
// 32x64 px with the plant standing on the bottom of the frame.
// Run with `npm run tilesets`; the output is committed.

import path from 'node:path';
import { CROP_KINDS, CROP_STAGES, type CropName } from '../../src/systems/crops';
import { readPng, ROOT, writePng, type Image } from './image';

const SRC = path.join(ROOT, 'art/lpc_crops/crops.png');
const OUT = path.join(ROOT, 'public/tilesets/crops.png');
export const FRAME_W = 32;
export const FRAME_H = 64;

/**
 * Where each crop's frames are on the source sheet: the sheet has two blocks (the first starting at y 0, the second at
 * y 320), each a column of 32px per crop and five 64px rows: sprout, two growing stages, ripe, then bare soil.
 */
const SOURCE: Record<CropName, { block: number; col: number }> = {
  potato: { block: 0, col: 0 },
  carrot: { block: 0, col: 6 },
  cabbage: { block: 320, col: 3 },
  tomato: { block: 320, col: 28 },
  strawberry: { block: 320, col: 20 },
  pumpkin: { block: 0, col: 27 },
  watermelon: { block: 0, col: 23 },
};

function copy(from: Image, sx: number, sy: number, to: Image, dx: number, dy: number) {
  for (let y = 0; y < FRAME_H; y++) {
    const s = ((sy + y) * from.width + sx) * 4;
    const d = ((dy + y) * to.width + dx) * 4;
    from.data.copy(to.data, d, s, s + FRAME_W * 4);
  }
}

export function buildCrops(): Image {
  const src = readPng(SRC);
  const out: Image = {
    width: FRAME_W * CROP_STAGES,
    height: FRAME_H * CROP_KINDS.length,
    data: Buffer.alloc(FRAME_W * CROP_STAGES * FRAME_H * CROP_KINDS.length * 4),
  };
  CROP_KINDS.forEach((kind, row) => {
    const { block, col } = SOURCE[kind];
    for (let stage = 0; stage < CROP_STAGES; stage++) {
      copy(src, col * FRAME_W, block + stage * FRAME_H, out, stage * FRAME_W, row * FRAME_H);
    }
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writePng(OUT, buildCrops());
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
