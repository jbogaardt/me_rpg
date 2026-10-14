import { describe, expect, it } from 'vitest';
import { arrivalFacing, cellFeet, doorAt, doorsNear } from './doors';
import type { DoorSpawn } from './types';

const door = (col: number, row: number, w: number, zone: string): DoorSpawn => ({
  col,
  row,
  w,
  to: { zone, col: 4, row: 7 },
});
const outside = { doors: [door(16, 45, 2, 'shop_smithy'), door(22, 45, 1, 'shop_armory')] };

describe('a doorway on an east or west edge (a column, `h` cells tall)', () => {
  const east = { doors: [{ ...door(49, 19, 1, 'next'), h: 3 }] };
  it('takes the player on any of its cells, not beside them', () => {
    for (const row of [19, 20, 21]) expect(doorAt(east, ...cellFeet({ col: 49, row }))?.to.zone).toBe('next');
    expect(doorAt(east, ...cellFeet({ col: 49, row: 22 }))).toBeUndefined();
    expect(doorAt(east, ...cellFeet({ col: 48, row: 20 }))).toBeUndefined();
  });
  it('turns the player away from it on arrival', () => {
    expect(arrivalFacing({ doors: [{ ...door(49, 19, 1, 'from'), h: 3 }] }, 'from', { col: 46, row: 20 })).toBe('left');
  });
});

describe('doorAt', () => {
  it('finds the door whose cells the feet stand on', () => {
    expect(doorAt(outside, ...cellFeet({ col: 16, row: 45 }))?.to.zone).toBe('shop_smithy');
    expect(doorAt(outside, ...cellFeet({ col: 17, row: 45 }))?.to.zone).toBe('shop_smithy'); // a two-cell door
    expect(doorAt(outside, ...cellFeet({ col: 22, row: 45 }))?.to.zone).toBe('shop_armory');
  });

  it('is not triggered beside, below or above a door', () => {
    for (const cell of [
      { col: 18, row: 45 },
      { col: 15, row: 45 },
      { col: 16, row: 46 },
      { col: 16, row: 44 },
      { col: 23, row: 45 },
    ]) {
      expect(doorAt(outside, ...cellFeet(cell))).toBeUndefined();
    }
  });

  it('counts feet on the very bottom edge of a cell as in that cell', () => {
    expect(doorAt(outside, 16.5 * 32, 46 * 32)?.to.zone).toBe('shop_smithy'); // y = bottom of row 45
    expect(doorAt(outside, 16.5 * 32, 46 * 32 + 1)).toBeUndefined(); // one pixel into row 46
  });
});

describe('doorsNear', () => {
  it('lists the doors within the radius, so their zones can be loaded before the player gets there', () => {
    const [x, y] = cellFeet({ col: 16, row: 47 });
    expect(doorsNear(outside, x, y, 100).map((d) => d.to.zone)).toEqual(['shop_smithy']);
    expect(doorsNear(outside, x, y, 400).map((d) => d.to.zone)).toEqual(['shop_smithy', 'shop_armory']);
    expect(doorsNear(outside, 5000, 5000, 400)).toEqual([]);
  });
});

describe('arrivalFacing', () => {
  it('faces away from the door the player came in by', () => {
    const inside = { doors: [door(4, 8, 2, 'town')] };
    expect(arrivalFacing(inside, 'town', { col: 4, row: 7 })).toBe('up'); // in the shop, walking in from the mat
    expect(arrivalFacing(outside, 'shop_smithy', { col: 16, row: 46 })).toBe('down'); // back out in front of the building
    expect(arrivalFacing({ doors: [] }, 'x', { col: 0, row: 3 })).toBe('down');
  });

  it('faces along the row when the way back is a door on the east or west edge', () => {
    const west = { doors: [4, 5, 6].map((r) => door(0, r, 1, 'greenwood')) }; // the zone's west edge
    expect(arrivalFacing(west, 'greenwood', { col: 2, row: 5 })).toBe('right');
    const east = { doors: [4, 5, 6].map((r) => door(45, r, 1, 'scorched')) };
    expect(arrivalFacing(east, 'scorched', { col: 43, row: 5 })).toBe('left');
  });
});
