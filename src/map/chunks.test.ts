import { describe, expect, it } from 'vitest';
import { chunkRange, chunksOfObjects, CHUNK } from './chunks';
import { CELL } from './types';

const S = CHUNK * CELL;

describe('chunkRange', () => {
  it('covers the view and a margin, clamped to the map', () => {
    expect(chunkRange({ x: S * 2.5, y: S * 1.2, w: S, h: S / 2 }, 10, 10, 1)).toEqual({ c0: 1, r0: 0, c1: 4, r1: 2 });
    expect(chunkRange({ x: 0, y: 0, w: S * 20, h: S * 20 }, 3, 2, 1)).toEqual({ c0: 0, r0: 0, c1: 2, r1: 1 });
  });
});

describe('chunksOfObjects', () => {
  it('files each object under the chunk its foot stands in', () => {
    const objects = [
      { s: 0, x: 0, y: 0, w: 32, h: 64, px: 10, py: 10 }, // foot in chunk 0
      { s: 0, x: 0, y: 0, w: 96, h: 96, px: S - 40, py: S - 90 }, // foot just over both lines: chunk 3
      { s: 0, x: 0, y: 0, w: 32, h: 32, px: -50, py: 2 * S + 5 }, // off the map's left: clamped to column 0, row 1
    ];
    const chunks = chunksOfObjects({ width: 2 * CHUNK, height: 2 * CHUNK, objects });
    expect(chunks).toEqual([[0], [], [2], [1]]);
  });
});
