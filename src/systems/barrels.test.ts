import { describe, expect, it } from 'vitest';
import type { MapObject } from '../map/types';
import {
  barrelSpots,
  barrelsFromWire,
  barrelsWire,
  BARREL_REACH,
  dropSpot,
  nearestBarrel,
  validBarrelsWire,
} from './barrels';
import { Collision } from './collision';

const obj = (tag: string | undefined, px: number, py: number): MapObject => ({
  s: 0,
  x: 0,
  y: 0,
  w: 28,
  h: 40,
  px,
  py,
  tag,
});

describe('barrels', () => {
  it('finds the map objects tagged barrel, in order, standing where their feet are', () => {
    const objects = [obj('tree', 0, 0), obj('barrel', 64, 24), obj(undefined, 0, 0), obj('barrel', 100, 60)];
    const spots = barrelSpots({ objects, surfaces: ['grass'], surface: new Array<number>(100).fill(0), width: 10 });
    expect(spots).toEqual([
      { object: 1, x: 78, y: 64 },
      { object: 3, x: 114, y: 100 },
    ]);
  });

  it('leaves out a barrel standing in a neighbour margin', () => {
    const surface = new Array<number>(100).fill(0);
    surface[1 * 10 + 2] = 1; // cell col 2, row 1: where the first barrel's feet are (x 78, y 64 -> col 2, row 1)
    const objects = [obj('barrel', 64, 24), obj('barrel', 100, 60)];
    const spots = barrelSpots({ objects, surfaces: ['grass', 'beyond'], surface, width: 10 });
    expect(spots.map((s) => s.object)).toEqual([1]);
  });

  it('picks the nearest barrel in reach', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 110, y: 100 };
    expect(nearestBarrel([a, b], 112, 100)).toBe(b);
    expect(nearestBarrel([a, b], 100 + BARREL_REACH + 60, 100)).toBeUndefined();
  });

  it('sets a barrel down in front, nearer when blocked, nowhere when there is no room', () => {
    const open = new Collision(10, 10, []);
    expect(dropSpot(open, 160, 160, 'down', [])).toEqual({ x: 160, y: 186 });
    // something stands where the first choice is: the nearer spot is tried
    const wall = new Collision(10, 10, [6 * 10 + 5]); // the cell at col 5, row 6 (y 192..224)
    const spot = dropSpot(wall, 176, 170, 'down', []);
    expect(spot).not.toBeNull();
    expect(spot).toEqual({ x: 176, y: 188 });
    const crowded = new Collision(10, 10, []);
    expect(dropSpot(crowded, 176, 150, 'down', [{ x: 176, y: 176 }])).toBeNull();
  });

  it('a barrel on the ground blocks bodies', () => {
    const c = new Collision(10, 10, []);
    const barrel = { x: 160, y: 160, size: 2 };
    const walker = { x: 160, y: 190 };
    expect(c.canMove(walker, 160, 168, [barrel])).toBe(false);
    expect(c.canMove(walker, 160, 190, [barrel])).toBe(true);
  });

  it('lists only the barrels away from home on the wire, and reads them back', () => {
    const home = { x: 50, y: 50 };
    const list = [
      { x: 50, y: 50, home, carried: false },
      { x: 80.4, y: 90, home, carried: false },
      { x: 50, y: 50, home, carried: true },
    ];
    const wire = barrelsWire(list);
    expect(wire).toEqual([1, 80, 90, 0, 2, 50, 50, 1]);
    expect(validBarrelsWire(wire)).toBe(true);
    expect(barrelsFromWire(wire).get(2)).toEqual({ x: 50, y: 50, carried: true });
    expect(barrelsWire([list[0]!])).toBeUndefined();
    expect(validBarrelsWire([1, 2, 3])).toBe(false);
    expect(validBarrelsWire([99, 0, 0, 0])).toBe(false);
    expect(validBarrelsWire([0, 0, 0, 2])).toBe(false);
  });
});
