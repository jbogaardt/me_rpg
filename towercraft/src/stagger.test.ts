import { describe, expect, it } from 'vitest';
import { LANE_WIDTH, drawnPos, laneOf } from './stagger';
import { BOARDS } from './sim/board';
import { unitPos } from './sim/sim';

const board = BOARDS.frostlands!;

describe('staggering units drawn on the road', () => {
  it('puts consecutive ids in different lanes, none outside the road', () => {
    const lanes = [1, 2, 3, 4, 5].map(laneOf);
    expect(new Set(lanes).size).toBe(5);
    for (const l of lanes) expect(Math.abs(l)).toBeLessThanOrEqual(2 * LANE_WIDTH + 1e-9);
    expect(2 * LANE_WIDTH).toBeLessThan(board.halfWidth ?? 1);
  });

  it('shifts square to the road, by the lane, whichever way the road runs and whoever walks it', () => {
    for (const owner of [0, 1] as const)
      for (const s of [10, 120, 200]) {
        const u = { id: 3, owner, s };
        const [x, y] = unitPos(u, board);
        const [px, py] = drawnPos(u, board);
        expect(Math.hypot(px - x, py - y)).toBeCloseTo(Math.abs(laneOf(3)));
        const [dx, dy] = board.directionAt(owner === 0 ? s : board.roadLength - s);
        expect((px - x) * dx + (py - y) * dy).toBeCloseTo(0);
      }
  });

  it('leaves a unit that stepped off the road where it is', () => {
    const u = { id: 4, owner: 0 as const, s: 50, off: { tower: 1, dir: [0, -1] as [number, number], d: 3, max: 5 } };
    expect(drawnPos(u, board)).toEqual(unitPos(u, board));
  });
});
