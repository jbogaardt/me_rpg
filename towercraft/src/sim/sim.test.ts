import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import { CASTLES, ROAD_CELLS, ROAD_LENGTH, cellIndex } from './board';
import { RACE_IDS, RACES, type RaceId } from './races';
import {
  BASE_PAY,
  PAY_EVERY,
  START_GOLD,
  TIME_LIMIT,
  buildReach,
  buildTower,
  canBuild,
  newMatch,
  step,
  trainUnit,
  unitPos,
  upgradeCastle,
  type Match,
} from './sim';

const run = (m: Match, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) step(m, 1 / 20);
};
/** A free cell near player 0's castle (inside its starting reach). */
const NEAR: [number, number] = [6, 3];

describe('the board', () => {
  it('has a free cell at the place the tests build on, and castles at the ends of the road', () => {
    expect(ROAD_CELLS.has(cellIndex(...NEAR))).toBe(false);
    expect(Math.hypot(CASTLES[0][0] - CASTLES[1][0], CASTLES[0][1] - CASTLES[1][1])).toBeGreaterThan(30);
  });
});

describe('building', () => {
  it('takes gold, and refuses the road, a taken cell, a castle, the wrong tier and a cell out of reach', () => {
    const m = newMatch(['legion', 'legion']);
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('ok');
    expect(m.players[0].gold).toBe(START_GOLD - RACES.legion.towers[0]!.cost);
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('taken');
    expect(buildTower(m, 1, 'watch', ...NEAR)).toBe('taken'); // a cell is one tower's, whoever's
    expect(buildTower(m, 0, 'watch', 3, 5)).toBe('road');
    expect(buildTower(m, 0, 'watch', 4, 3)).toBe('castle');
    expect(buildTower(m, 0, 'catapult', 6, 4)).toBe('tier');
    expect(buildTower(m, 0, 'watch', 12, 12)).toBe('area'); // far from player 0's castle
    expect(buildTower(m, 0, 'nope', 6, 4)).toBe('unknown');
    expect(buildTower(m, 0, 'watch', -1, 0)).toBe('off-board');
    m.players[0].gold = 0;
    expect(buildTower(m, 0, 'watch', 6, 5)).toBe('gold');
  });

  it('reaches further with an upgraded castle and from a tower already built', () => {
    const m = newMatch(['legion', 'legion']);
    const def = RACES.legion.towers[0]!;
    const far: [number, number] = [11, 3]; // 8 cells out: beyond the first level's reach of 6
    expect(canBuild(m, 0, def, ...far)).toBe('area');
    m.players[0].gold = 1000;
    upgradeCastle(m, 0);
    expect(buildReach(m, 0)).toBe(9);
    expect(canBuild(m, 0, def, ...far)).toBe('ok');

    // A tower's own reach carries the build area on: from (6,3) a tower reaches 3 cells further.
    const m2 = newMatch(['legion', 'legion']);
    m2.players[0].gold = 1000;
    expect(canBuild(m2, 0, def, 9, 5)).toBe('area');
    buildTower(m2, 0, 'watch', 6, 4);
    expect(canBuild(m2, 0, def, 9, 4)).toBe('ok');
  });
});

describe('the castle', () => {
  it('upgrades for gold, gaining hit points and pay, and stops at the top', () => {
    const m = newMatch(['titan', 'legion']);
    m.players[0].gold = 1000;
    expect(upgradeCastle(m, 0)).toBe('ok');
    expect(upgradeCastle(m, 0)).toBe('ok');
    expect(upgradeCastle(m, 0)).toBe('max');
    expect(m.players[0].castle.level).toBe(3);
    expect(m.players[0].castle.maxHp).toBe(RACES.titan.castle.hp + 2 * RACES.titan.castle.hpPerLevel);
    expect(m.players[0].gold).toBe(1000 - 160 - 360);
    m.players[1].gold = 0;
    expect(upgradeCastle(m, 1)).toBe('gold');
  });

  it('pays every pay day, more when upgraded', () => {
    const m = newMatch(['swarm', 'swarm']);
    run(m, PAY_EVERY + 0.2);
    expect(m.players[0].gold).toBe(START_GOLD + BASE_PAY);
  });
});

describe('training', () => {
  it('queues units, which step out after their training time, a pair for the goblins', () => {
    const m = newMatch(['swarm', 'legion']);
    expect(trainUnit(m, 0, 'spearman')).toBe('ok');
    expect(m.players[0].gold).toBe(START_GOLD - 16);
    expect(m.units).toHaveLength(0);
    run(m, 1.6);
    expect(m.units).toHaveLength(2);
    expect(m.players[0].queue).toHaveLength(0);
    expect(trainUnit(m, 0, 'thief')).toBe('tier');
    expect(trainUnit(m, 0, 'nope')).toBe('unknown');
  });
});

describe('fighting', () => {
  it('has units meet between the castles and fight, the dead paying the killer a bounty', () => {
    const m = newMatch(['legion', 'legion']);
    m.players[0].gold = m.players[1].gold = 1000;
    for (let i = 0; i < 4; i++) trainUnit(m, 0, 'warrior');
    for (let i = 0; i < 2; i++) trainUnit(m, 1, 'warrior');
    run(m, 90); // the armies need about a minute to cross the road
    expect(m.units.length).toBeLessThan(6); // some have died
    expect(m.units.every((u) => u.s < ROAD_LENGTH)).toBe(true);
    const lost = [0, 1].map((o) => m.units.filter((u) => u.owner === o).length);
    expect(lost[0]).toBeGreaterThan(lost[1]!); // four against two: player 0 holds more
  });

  it('has towers shoot units but never other towers, and units attack the towers in their way', () => {
    const m = newMatch(['legion', 'legion']);
    buildTower(m, 0, 'watch', 4, 5); // beside the road, 2 cells out from player 0's castle
    buildTower(m, 1, 'watch', 17, 36); // near player 1's castle
    run(m, 30);
    expect(m.towers.every((t) => t.hp === t.def.hp)).toBe(true); // nothing shot at the other's tower

    // A warrior of player 1 comes down the road to player 0's tower: it fights it (the tower's own shots hurt it too).
    m.units.push({ id: 77, def: RACES.legion.units[1]!, owner: 1, hp: 5000, s: ROAD_LENGTH - 6, cooldown: 0 });
    run(m, 20);
    expect(m.towers.find((t) => t.owner === 0)?.hp ?? 0).toBeLessThan(RACES.legion.towers[0]!.hp);
  });

  it('has a unit at the enemy castle hit it, and destroying a castle ends the match', () => {
    const m = newMatch(['legion', 'swarm']);
    m.players[1].castle.hp = 20;
    m.units.push({ id: 99, def: RACES.legion.units[1]!, owner: 0, hp: 240, s: ROAD_LENGTH - 3, cooldown: 0 });
    run(m, 15);
    expect(m.winner).toBe(0);
    expect(unitPos({ owner: 0, s: 0 })).toEqual([CASTLES[0][0], CASTLES[0][1]]);
  });

  it('reports a kill in the step it happens', () => {
    const m = newMatch(['legion', 'legion']);
    buildTower(m, 0, 'watch', ...NEAR);
    m.units.push({ id: 50, def: RACES.legion.units[0]!, owner: 1, hp: 1, s: ROAD_LENGTH - 5, cooldown: 99 });
    const deaths: number[] = [];
    for (let i = 0; i < 20; i++) {
      step(m, 1 / 20);
      deaths.push(m.deaths.length);
    }
    expect(deaths.reduce((a, b) => a + b, 0)).toBe(1);
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
      expect([again.winner, again.players[0].castle.hp, again.players[1].castle.hp]).toEqual([
        first.winner,
        first.players[0].castle.hp,
        first.players[1].castle.hp,
      ]);
    },
    60_000,
  );
});
