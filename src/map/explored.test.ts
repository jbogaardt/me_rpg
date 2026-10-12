import { describe, expect, it } from 'vitest';
import { Atlas, Explored } from './explored';
import { minimapPixels } from './minimap';
import { CELL, parseMap } from './types';

describe('Explored', () => {
  it('reveals a disc around a position and reports new cells only', () => {
    const e = new Explored(40, 40);
    expect(e.reveal(20 * CELL, 20 * CELL, 3)).toBe(true);
    expect(e.cells[20 * 40 + 20]).toBe(1);
    expect(e.cells[20 * 40 + 23]).toBe(1);
    expect(e.cells[20 * 40 + 30]).toBe(0);
    expect(e.cells[0]).toBe(0);
    const v = e.version;
    expect(e.reveal(20 * CELL, 20 * CELL, 3)).toBe(false);
    expect(e.version).toBe(v);
  });

  it('stays inside the map at the corners', () => {
    const e = new Explored(10, 10);
    expect(e.reveal(-50, -50, 4)).toBe(true);
    expect(e.reveal(10 * CELL + 5, 10 * CELL + 5, 4)).toBe(true);
    expect(e.count()).toBeGreaterThan(0);
  });
});

describe('Atlas', () => {
  it('keeps one Explored per zone name', () => {
    const data = parseMap({
      version: 2,
      width: 2,
      height: 2,
      ground: [null, null, null, null],
      surfaces: ['grass'],
      surface: [0, 0, 0, 0],
      collision: [],
    });
    const atlas = new Atlas();
    expect(atlas.of('a', data)).toBe(atlas.of('a', data));
    expect(atlas.of('b', data)).not.toBe(atlas.of('a', data));
  });
});

describe('minimapPixels with fog', () => {
  const map = parseMap({
    version: 2,
    width: 3,
    height: 1,
    ground: [null, null, null],
    surfaces: ['grass', 'beyond'],
    surface: [0, 0, 1],
    collision: [],
  });
  it('leaves unseen cells transparent but always draws the neighbouring biome', () => {
    const px = minimapPixels(map, [1, 0, 0]);
    expect(px[3]).toBe(255);
    expect(px[7]).toBe(0);
    expect(px[11]).toBe(255);
  });
});
