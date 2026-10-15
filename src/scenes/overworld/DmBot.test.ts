import { describe, expect, it } from 'vitest';
import { CELL } from '../../map/types';
import { openGroundNear } from './DmBot';

const hero = (col: number, row: number) => ({ body: { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL } });
const open = { isBlocked: (col: number, row: number) => col < 0 || row < 0 || col > 30 || row > 30 };

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
