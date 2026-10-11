import { describe, expect, it } from 'vitest';
import { mapPercent, minimapPixels } from './minimap';
import { CELL, parseMap } from './types';

// 3x2 map: grass, sand, water on top; snow, grass (blocked), unknown surface below.
const map = parseMap({
  version: 2,
  width: 3,
  height: 2,
  ground: new Array(6).fill(null),
  surfaces: ['grass', 'sand', 'water', 'snow', 'quicksilver'],
  surface: [0, 1, 2, 3, 0, 4],
  collision: [2, 4],
});

const px = (data: Uint8ClampedArray, i: number) => [...data.slice(i * 4, i * 4 + 4)];

describe('minimapPixels', () => {
  const pixels = minimapPixels(map);

  it('has one opaque pixel per cell', () => {
    expect(pixels).toHaveLength(6 * 4);
    for (let i = 0; i < 6; i++) expect(px(pixels, i)[3]).toBe(255);
  });

  it('colours each cell by its surface', () => {
    expect(px(pixels, 0)).not.toEqual(px(pixels, 1)); // grass vs sand
    expect(px(pixels, 3)).toEqual([238, 243, 248, 255]); // snow
  });

  it('darkens blocked land but not water', () => {
    const [r] = px(pixels, 0); // open grass
    const [blockedR] = px(pixels, 4); // blocked grass
    expect(blockedR).toBeLessThan(r!);
    expect(px(pixels, 2)).toEqual([56, 108, 178, 255]); // blocked water keeps its colour
  });

  it('draws an unknown surface grey rather than failing', () => {
    expect(px(pixels, 5)).toEqual([120, 120, 120, 255]);
  });
});

describe('mapPercent', () => {
  it('maps world pixels to percentages of the map', () => {
    expect(mapPercent(map, 0, 0)).toEqual({ left: 0, top: 0 });
    expect(mapPercent(map, 1.5 * CELL, 1 * CELL)).toEqual({ left: 50, top: 50 });
    expect(mapPercent(map, 3 * CELL, 2 * CELL)).toEqual({ left: 100, top: 100 });
  });

  it('clamps positions outside the map', () => {
    expect(mapPercent(map, -50, 9999)).toEqual({ left: 0, top: 100 });
  });
});
