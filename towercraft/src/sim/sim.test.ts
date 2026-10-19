import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import { ROAD_CELLS, ROAD_LENGTH, WAYPOINTS, cellIndex } from './board';
import { RACE_IDS, RACES, type RaceId } from './races';
import { BASE_PAY, PAY_EVERY, START_GOLD, START_LIVES, TIME_LIMIT, buildTower, newMatch, sendUnits, step } from './sim';

const free = (): [number, number] => {
  for (let r = 0; r < 14; r++) for (let c = 0; c < 10; c++) if (!ROAD_CELLS.has(cellIndex(c, r))) return [c, r];
  throw new Error('no free cell');
};

describe('building', () => {
  it('takes gold, and refuses the road, an occupied cell and an empty purse', () => {
    const m = newMatch(['legion', 'legion']);
    const [c, r] = free();
    expect(buildTower(m, 0, 'archer', c, r)).toBe('ok');
    expect(m.players[0].gold).toBe(START_GOLD - RACES.legion.towers[0]!.cost);
    expect(buildTower(m, 0, 'archer', c, r)).toBe('taken');
    expect(buildTower(m, 1, 'archer', c, r)).toBe('ok'); // the other lane is its own board
    const [rc, rr] = [WAYPOINTS[0]![0], WAYPOINTS[0]![1]];
    expect(buildTower(m, 0, 'archer', rc, rr)).toBe('road');
    expect(buildTower(m, 0, 'archer', -1, 0)).toBe('off-board');
    expect(buildTower(m, 0, 'nope', c, r)).toBe('unknown');
    m.players[0].gold = 0;
    expect(buildTower(m, 0, 'cannon', 5, 5)).toBe('gold');
  });
});

describe('sending', () => {
  it('buys a wave that walks the OTHER lane, and raises pay', () => {
    const m = newMatch(['swarm', 'legion']);
    expect(sendUnits(m, 0, 'skitter')).toBe('ok');
    expect(m.units).toHaveLength(3);
    expect(m.players[0].income).toBe(1);
    for (let i = 0; i < PAY_EVERY * 20 + 2; i++) step(m, 1 / 20);
    expect(m.players[0].gold).toBe(START_GOLD - 12 + BASE_PAY + 1);
  });

  it('takes lives from the lane owner when a unit gets through', () => {
    const m = newMatch(['legion', 'legion']);
    sendUnits(m, 0, 'footman');
    const seconds = ROAD_LENGTH / RACES.legion.units[0]!.speed + 1;
    for (let i = 0; i < seconds * 20; i++) step(m, 1 / 20);
    expect(m.units).toHaveLength(0);
    expect(m.players[1].lives).toBe(START_LIVES - 1);
    expect(m.players[0].lives).toBe(START_LIVES);
  });
});

describe('towers', () => {
  it('kill what walks their lane, and pay the defender a bounty', () => {
    const m = newMatch(['legion', 'legion']);
    // A cell beside the road's first long run, so the target passes well inside range.
    for (const col of [3, 4, 5]) expect(buildTower(m, 1, 'archer', col, 2)).toBe('ok');
    const gold = m.players[1].gold;
    sendUnits(m, 0, 'footman');
    for (let i = 0; i < 20 * 20; i++) step(m, 1 / 20);
    expect(m.units).toHaveLength(0);
    expect(m.players[1].lives).toBe(START_LIVES);
    expect(m.players[1].gold).toBeGreaterThan(gold - 1);
  });
});

describe('a whole match', () => {
  const play = (a: RaceId, b: RaceId, seed: number) => {
    const m = newMatch([a, b]);
    const ai = [createAi(0, seed), createAi(1, seed + 1)] as const;
    while (m.winner < 0) {
      ai[0](m, 0.05);
      ai[1](m, 0.05);
      step(m, 0.05);
    }
    return m;
  };

  it.each(RACE_IDS.flatMap((a) => RACE_IDS.map((b) => [a, b] as const)))(
    '%s against %s ends, and replays the same',
    (a, b) => {
      const first = play(a, b, 7);
      expect(first.time).toBeLessThanOrEqual(TIME_LIMIT + 1);
      const again = play(a, b, 7);
      expect([again.winner, again.players[0].lives, again.players[1].lives]).toEqual([
        first.winner,
        first.players[0].lives,
        first.players[1].lives,
      ]);
    },
  );
});
