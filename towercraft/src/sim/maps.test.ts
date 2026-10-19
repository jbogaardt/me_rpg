import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import type { TowerDef } from './races';
import { MAPS, MAP_IDS, symmetric } from './maps';
import { canBuild, newMatch, step } from './sim';

/** A tower def that asks nothing, so only the board's rules answer. */
const free = { tier: 1, cost: 0 } as unknown as TowerDef;

describe('the balance maps', () => {
  it.each(MAP_IDS)('%s is turned half way round onto itself, so neither side has better ground', (id) => {
    const b = MAPS[id]!;
    for (const cell of b.roadCells) {
      const [col, row] = [cell % b.cols, Math.floor(cell / b.cols)];
      expect(b.roadCells.has(b.cellIndex(b.cols - 1 - col, b.rows - 1 - row))).toBe(true);
    }
    const [a, z] = b.castles;
    expect(a[0] + z[0]).toBeCloseTo(b.cols);
    expect(a[1] + z[1]).toBeCloseTo(b.rows);
    // The walk is as long from either castle, and the castles are well apart.
    expect(b.pointAt(0)).toEqual(a);
    expect(b.pointAt(b.roadLength)).toEqual(z);
    expect(b.airLength).toBeGreaterThan(20);
  });

  it('builds a road from its first half', () => {
    expect(
      symmetric(10, 11, [
        [1, 1],
        [1, 5],
      ]),
    ).toEqual([
      [1, 1],
      [1, 5],
      [8, 5],
      [8, 9],
    ]);
  });

  it('plays on the board the match carries, not the default one', () => {
    const short = newMatch(['legion', 'legion'], MAPS.switchback);
    const long = newMatch(['legion', 'legion'], MAPS.marathon);
    // A cell on the short map's road is off the long map's (and a tower is refused on each for its own reasons).
    const cell = [...MAPS.switchback!.roadCells][0]!;
    const [col, row] = [cell % short.board.cols, Math.floor(cell / short.board.cols)];
    expect(canBuild(short, 0, short.players[0] && free, col, row)).toBe('road');
    expect(canBuild(long, 0, free, 20, 70)).not.toBe('off-board');
    expect(canBuild(short, 0, free, 20, 70)).toBe('off-board');
  });

  it.each(MAP_IDS)(
    '%s: two AIs play it to the end',
    (id) => {
      const m = newMatch(['legion', 'swarm'], MAPS[id]);
      const ai = [createAi(0, 1), createAi(1, 2)] as const;
      while (m.winner < 0) {
        ai[0](m, 0.05);
        ai[1](m, 0.05);
        step(m, 0.05);
      }
      expect(m.winner).toBeGreaterThanOrEqual(0);
      expect(m.time).toBeGreaterThan(30);
    },
    120_000,
  ); // games last a quarter of an hour of game time now
});
