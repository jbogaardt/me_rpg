import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { openGroundBeside, openGroundNear } from './dmPeople';

const hero = (col: number, row: number) => ({ body: { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL } });
const open = { isBlocked: (col: number, row: number) => col < 0 || row < 0 || col > 30 || row > 30 };

import { pickLook } from './dmPeople';

describe('openGroundNear', () => {
  it('stands a new person 3 or more cells from every hero, on open ground', () => {
    const heroes = [hero(10, 10), hero(14, 10)];
    const at = openGroundNear(open, heroes);
    expect(at).not.toBeNull();
    for (const h of heroes) {
      const apart = Math.max(
        Math.abs(at!.col - Math.floor(h.body.x / CELL)),
        Math.abs(at!.row - Math.floor(h.body.y / CELL)),
      );
      expect(apart).toBeGreaterThanOrEqual(3);
    }
  });
  it('skips blocked ground and gives up when there is none', () => {
    expect(openGroundNear({ isBlocked: () => true }, [hero(10, 10)])).toBeNull();
    const wall = { isBlocked: (col: number) => col > 10 };
    expect(openGroundNear(wall, [hero(10, 10)])!.col).toBeLessThanOrEqual(9);
  });
  it('needs someone to stand near', () => {
    expect(openGroundNear(open, [])).toBeNull();
  });
});

describe('pickLook', () => {
  const looks = [
    { id: 'a', name: 'Castaway' },
    { id: 'b', name: 'Old Monk' },
    { id: 'c', name: 'Smith' },
  ];
  it('wears the look the hint names, else the next in turn', () => {
    expect(pickLook(looks, 'monk', 0)).toBe('b');
    expect(pickLook(looks, 'dragon', 4)).toBe('b');
    expect(pickLook(looks, undefined, 2)).toBe('c');
    expect(pickLook([], 'monk', 0)).toBeNull();
  });
});

describe('openGroundBeside', () => {
  it('stands someone two or more cells from a door, on open ground, nearest first', () => {
    const at = openGroundBeside(open, { col: 10, row: 10, w: 2 });
    expect(at).not.toBeNull();
    const ring = Math.max(10 - at!.col, at!.col - 11, 10 - at!.row, at!.row - 10);
    expect(ring).toBe(2);
  });
  it('skips walls and gives up when closed in', () => {
    expect(openGroundBeside({ isBlocked: () => true }, { col: 10, row: 10, w: 2 })).toBeNull();
    const north = openGroundBeside(
      { isBlocked: (_c: number, row: number) => row < 10 || row > 30 },
      { col: 10, row: 10, w: 1 },
    );
    expect(north!.row).toBeGreaterThanOrEqual(11);
  });
});
