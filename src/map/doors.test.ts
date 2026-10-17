import { describe, expect, it } from 'vitest';
import { arrivalFacing, cellFeet, doorAt, doorsNear, keepOffDoors, pointFromNeighbour } from './doors';
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

describe('a bot DM that strolls about the party (issue #39)', () => {
  // The follow rule fired every ten seconds because a stroll next to a doorway took the DM through it, out of the
  // party's zone; the rule then (rightly) sent him back, and the next stroll took him out again.
  it('is never walked onto a door by his own stroll', () => {
    const [x, y] = cellFeet({ col: 16, row: 44 }); // the cell above the smithy's door
    expect(keepOffDoors(outside, x, y, 0, 1)).toEqual([0, 0]); // straight down would step on it
    expect(keepOffDoors(outside, x, y, 1, 1)).toEqual([1, 0]); // sliding along the wall is fine
    expect(keepOffDoors(outside, x, y, 0, -1)).toEqual([0, -1]); // so is walking away
  });
  it('leaves a walk in open ground alone', () => {
    const [x, y] = cellFeet({ col: 40, row: 20 });
    for (const [dx, dy] of [
      [1, 0],
      [-1, 1],
      [0, -1],
    ] as const)
      expect(keepOffDoors(outside, x, y, dx, dy)).toEqual([dx, dy]);
  });
});

describe('a friend just across a gap (the DM bot kept going to a player who stood beside him)', () => {
  // A gap on the east edge: the next zone's map is laid beside this one, so its x is smaller by the width gone past.
  const east: DoorSpawn = { col: 99, row: 50, w: 1, dir: 'right', to: { zone: 'meadow_east', col: 0, row: 50 } };
  const here = { doors: [east], indoor: false };
  it("puts a point of the next zone in this zone's pixels, so its distance can be told", () => {
    const p = pointFromNeighbour(here, 'meadow_east', 3 * 32, 50 * 32);
    expect(p).not.toBeNull();
    expect(p!.x).toBeGreaterThan(95 * 32); // a few cells into the next zone is just past this one's east edge
  });
  it('knows no offset for a zone that is not next door, or from a room', () => {
    expect(pointFromNeighbour(here, 'far_away', 0, 0)).toBeNull();
    expect(pointFromNeighbour({ doors: [east], indoor: true }, 'meadow_east', 0, 0)).toBeNull();
  });
});
