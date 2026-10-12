import { describe, expect, it } from 'vitest';
import { limitOffset } from '../core/camera';
import { edgeLimits, FADE_CELLS, HOLD_CELLS, zoneRegion } from './edges';
import { CELL, type DoorSpawn } from './types';

const east = (row: number): DoorSpawn => ({ col: 100, row, w: 1, to: { zone: 'next', col: 1, row }, dir: 'right' });
const south = (col: number): DoorSpawn => ({ col, row: 60, w: 1, to: { zone: 'next', col, row: 1 }, dir: 'down' });

describe('edgeLimits', () => {
  it('stops the view at the border while the player is level with the gap', () => {
    const doors = [east(40), east(41), east(42)];
    expect(edgeLimits(doors, 95 * CELL, 41.5 * CELL).right).toBe(101 * CELL);
    expect(edgeLimits(doors, 60 * CELL, 38 * CELL).right).toBe(101 * CELL); // far from the border, still level
    expect(edgeLimits(doors, 95 * CELL, 41.5 * CELL).left).toBeUndefined();
  });

  it('lets go smoothly as the player moves along the border away from the gap, never jumping', () => {
    const doors = [east(40)];
    const at = (cells: number) => edgeLimits(doors, 95 * CELL, (40.5 + cells) * CELL).right!;
    expect(at(HOLD_CELLS)).toBe(101 * CELL); // still held at the edge of the held range
    expect(at(HOLD_CELLS + FADE_CELLS)).toBeGreaterThan(101 * CELL + 100 * CELL); // fully free
    let last = at(HOLD_CELLS);
    for (let c = HOLD_CELLS; c <= HOLD_CELLS + FADE_CELLS; c += 0.25) {
      const v = at(c);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v - last).toBeLessThan(10 * CELL); // no jump between neighbouring quarter-cells
      last = v;
    }
  });

  it('handles every direction and combines gaps on different sides', () => {
    const doors: DoorSpawn[] = [
      south(20),
      { col: 0, row: 30, w: 1, to: { zone: 'w', col: 9, row: 30 }, dir: 'left' },
      { col: 50, row: 0, w: 1, to: { zone: 'n', col: 50, row: 9 }, dir: 'up' },
    ];
    const l = edgeLimits(doors, 22 * CELL, 31 * CELL);
    expect(l.bottom).toBe(61 * CELL);
    expect(l.left).toBe(0);
    expect(l.top!).toBeLessThan(-100 * CELL); // the north gap is 28 cells away along the border: no stop
    expect(edgeLimits([{ ...south(20), dir: undefined }], 20 * CELL, 59 * CELL)).toEqual({}); // a door with no direction
  });
});

describe('limitOffset', () => {
  it('keeps the view inside the limits, on either side', () => {
    // 640 px screen at zoom 1: the view spans [-offset, -offset + 640].
    expect(limitOffset(-1000, 640, 1, undefined, 1200)).toBe(-560); // far edge held at 1200
    expect(limitOffset(-400, 640, 1, undefined, 1200)).toBe(-400); // already inside
    expect(limitOffset(-100, 640, 1, 300, undefined)).toBe(-300); // near edge held at 300
    expect(limitOffset(-2000, 640, 2, undefined, 1200)).toBe(-1760); // zoom 2: the far edge is at (640 - offset) / 2
    // Limits closer than the view is wide: centred between them, whatever the offset asked for.
    expect(limitOffset(-1000, 640, 1, 300, 700)).toBe(-180);
    expect(limitOffset(-100, 640, 1, 300, 700)).toBe(-180);
  });
});

describe('zoneRegion', () => {
  // 60 x 60 map whose own cells are columns 10..49 and rows 10..49 (the rest is a neighbour's margin).
  const w = 60;
  const surface = Array.from({ length: w * w }, (_, i) => {
    const c = i % w;
    const r = Math.floor(i / w);
    return c >= 10 && c < 50 && r >= 10 && r < 50 ? 0 : 1;
  });
  const data = { width: w, height: w, surfaces: ['grass', 'beyond'], surface };
  const region = zoneRegion(data);

  it('holds the view at the zone edge everywhere, not only at a gap', () => {
    const l = edgeLimits([], 45 * CELL, 30 * CELL, region);
    expect(l.right).toBe(50 * CELL);
    expect(l.left).toBe(10 * CELL);
    expect(l.top).toBe(10 * CELL);
    expect(l.bottom).toBe(50 * CELL);
  });

  it('never leaves the player off-screen', () => {
    const l = edgeLimits([], 49.5 * CELL, 30 * CELL, region);
    expect(l.right!).toBeGreaterThanOrEqual(49.5 * CELL + 2 * CELL);
  });

  it('still pins the border at a gap, and eases to the zone edge away from it', () => {
    const doors = [{ ...east(30), col: 49 }];
    expect(edgeLimits(doors, 45 * CELL, 30.5 * CELL, region).right).toBe(50 * CELL);
    expect(edgeLimits(doors, 45 * CELL, 45 * CELL, region).right).toBe(50 * CELL);
  });
});
