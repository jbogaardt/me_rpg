import { describe, expect, it } from 'vitest';
import { mapBox, nearBorder } from './bounds';
import { CELL } from './types';

const map = (rows: string[]) => ({
  width: rows[0]!.length,
  height: rows.length,
  surfaces: ['grass', 'beyond'],
  surface: rows.flatMap((r) => [...r].map((c) => (c === '#' ? 1 : 0))),
});

describe('mapBox', () => {
  it('is the whole map', () => {
    expect(mapBox({ width: 4, height: 3 })).toEqual({ left: 0, top: 0, right: 4 * CELL, bottom: 3 * CELL });
  });
});

describe('nearBorder', () => {
  const data = map(['........', '........', '........', '......##']);
  it('sees the margin of the neighbours within reach and not beyond it', () => {
    expect(nearBorder(data, 1.5 * CELL, 0.5 * CELL, 3 * CELL)).toBe(false);
    expect(nearBorder(data, 4.5 * CELL, 2.5 * CELL, 3 * CELL)).toBe(true);
  });
  it('has nothing to see in a room', () => {
    expect(nearBorder({ width: 2, height: 2, surfaces: ['stone'], surface: [0, 0, 0, 0] }, CELL, CELL, 5 * CELL)).toBe(
      false,
    );
  });
});
