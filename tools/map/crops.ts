// Packs the LPC crops sheet (art/crops/crops.png, see CREDITS.md) into public/tilesets/crops.png as an indexed PNG.
// The art is used unmodified; this only re-encodes it. Run with `npx tsx tools/map/crops.ts` after replacing the source.

import path from 'node:path';
import { readPng, ROOT, writePng } from './image';

writePng(path.join(ROOT, 'public/tilesets/crops.png'), readPng(path.join(ROOT, 'art/crops/crops.png')));
