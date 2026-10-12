import { describe, expect, it } from 'vitest';
import { zoneBounds } from './bounds';
import { CELL } from './types';

const map = (rows: string[]) => ({
  width: rows[0]!.length,
  height: rows.length,
  surfaces: ['grass', 'beyond'],
  surface: rows.flatMap((r) => [...r].map((c) => (c === '#' ? 1 : 0))),
});

describe('zoneBounds', () => {
  it('is the box round the cells that are the zone, leaving out the neighbour margin', () => {
    const b = zoneBounds(map(['####....', '#...###.', '##.#####', '########']));
    expect(b).toEqual({ left: 1 * CELL, top: 0, right: 8 * CELL, bottom: 3 * CELL });
  });

  it('is the whole map for a room, which has no margin', () => {
    const room = { width: 4, height: 3, surfaces: ['stone'], surface: Array<number>(12).fill(0) };
    expect(zoneBounds(room)).toEqual({ left: 0, top: 0, right: 4 * CELL, bottom: 3 * CELL });
  });
});
