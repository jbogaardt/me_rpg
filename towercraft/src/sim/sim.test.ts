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
  AIR_LENGTH,
  powerAt,
  setOrder,
  visibleTo,
  type Match,
  type Owner,
  type Unit,
} from './sim';

const unitDef = (race: RaceId, id: string) => RACES[race].units.find((u) => u.id === id)!;
const towerDef = (race: RaceId, id: string) => RACES[race].towers.find((t) => t.id === id)!;
/** Put a tower on the board without paying or the build rules (tests place things where they need them). */
const put = (m: Match, owner: Owner, race: RaceId, id: string, col: number, row: number) => {
  const def = towerDef(race, id);
  m.towers.push({ id: m.nextId++, def, owner, col, row, hp: def.hp, cooldown: 0 });
};
/** The `s` of an enemy (player 1) air unit that flies closest to a point, for putting a flyer right beside something on the ground. */
const airNear = (at: readonly [number, number]) => {
  let best = 0;
  let bestDist = Infinity;
  for (let s = 0; s <= AIR_LENGTH; s += 0.05) {
    const [x, y] = unitPos({ owner: 1, s, def: unitDef('swarm', 'glider') });
    const d = Math.hypot(x - at[0], y - at[1]);
    if (d < bestDist) [best, bestDist] = [s, d];
  }
  return best;
};

const run = (m: Match, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) step(m, 1 / 20);
};
/** A free cell near player 0's castle (inside its starting reach). */
const NEAR: [number, number] = [8, 4];

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
    expect(m.players[0].gold).toBe(START_GOLD - towerDef('legion', 'watch').cost);
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('taken');
    expect(buildTower(m, 1, 'watch', ...NEAR)).toBe('taken'); // a cell is one tower's, whoever's
    expect(buildTower(m, 0, 'watch', 5, 4)).toBe('road');
    expect(buildTower(m, 0, 'watch', 6, 3)).toBe('castle');
    expect(buildTower(m, 0, 'catapult', 9, 4)).toBe('tier');
    expect(buildTower(m, 0, 'watch', 15, 16)).toBe('area'); // far from player 0's castle
    expect(buildTower(m, 0, 'nope', 9, 4)).toBe('unknown');
    expect(buildTower(m, 0, 'watch', -1, 0)).toBe('off-board');
    m.players[0].gold = 0;
    expect(buildTower(m, 0, 'watch', 9, 5)).toBe('gold');
  });

  it('reaches further with an upgraded castle and from a tower already built', () => {
    const m = newMatch(['legion', 'legion']);
    const def = towerDef('legion', 'watch');
    const far: [number, number] = [12, 3]; // 7 cells out: beyond the first level's reach of 6, inside the second's 9
    expect(canBuild(m, 0, def, ...far)).toBe('area');
    m.players[0].gold = 1000;
    upgradeCastle(m, 0);
    expect(buildReach(m, 0)).toBe(9);
    expect(canBuild(m, 0, def, ...far)).toBe('ok');

    // A tower's own reach carries the build area on: from (6,3) a tower reaches 3 cells further.
    const m2 = newMatch(['legion', 'legion']);
    m2.players[0].gold = 1000;
    expect(canBuild(m2, 0, def, 13, 4)).toBe('area');
    buildTower(m2, 0, 'watch', 10, 4);
    expect(canBuild(m2, 0, def, 13, 4)).toBe('ok');
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
    expect(m.players[0].gold).toBe(1000 - RACES.titan.castle.upgrades[0]! - RACES.titan.castle.upgrades[1]!);
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
  it('queues units, which step out after their training time, a trio for the goblins', () => {
    const m = newMatch(['swarm', 'legion']);
    expect(trainUnit(m, 0, 'spearman')).toBe('ok');
    expect(m.players[0].gold).toBe(START_GOLD - unitDef('swarm', 'spearman').cost);
    expect(m.units).toHaveLength(0);
    run(m, 1.6);
    expect(m.units).toHaveLength(unitDef('swarm', 'spearman').count);
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
    buildTower(m, 0, 'watch', 8, 5); // right beside the road, a few cells out from player 0's castle
    buildTower(m, 1, 'watch', 17, 36); // near player 1's castle
    run(m, 30);
    expect(m.towers.every((t) => t.hp === t.def.hp)).toBe(true); // nothing shot at the other's tower

    // A warrior of player 1 comes down the road to player 0's tower: it fights it (the tower's own shots hurt it too).
    m.units.push({ id: 77, def: unitDef('legion', 'ritter'), owner: 1, hp: 5000, s: ROAD_LENGTH - 6, cooldown: 0 });
    run(m, 20);
    expect(m.towers.find((t) => t.owner === 0)?.hp ?? 0).toBeLessThan(towerDef('legion', 'watch').hp);
  });

  it('has a unit at the enemy castle hit it, and destroying a castle ends the match', () => {
    const m = newMatch(['legion', 'swarm']);
    m.players[1].castle.hp = 20;
    m.units.push({ id: 99, def: unitDef('legion', 'ritter'), owner: 0, hp: 240, s: ROAD_LENGTH - 3, cooldown: 0 });
    run(m, 15);
    expect(m.winner).toBe(0);
    expect(unitPos({ owner: 0, s: 0, def: unitDef('legion', 'warrior') })).toEqual([CASTLES[0][0], CASTLES[0][1]]);
  });

  it('reports a kill in the step it happens', () => {
    const m = newMatch(['legion', 'legion']);
    buildTower(m, 0, 'watch', ...NEAR);
    m.units.push({ id: 50, def: unitDef('legion', 'warrior'), owner: 1, hp: 1, s: ROAD_LENGTH - 5, cooldown: 99 });
    const deaths: number[] = [];
    for (let i = 0; i < 20; i++) {
      step(m, 1 / 20);
      deaths.push(m.deaths.length);
    }
    expect(deaths.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('tower roles', () => {
  // A tower at (4,5) beside player 0's end of the road reaches both the road at 6 cells from the castle and the flight line there.
  const GROUND_S = ROAD_LENGTH - 6;
  const AIR_S = airNear([8, 6.6]); // flies about a cell and a half from the tower at (8, 5), over the road
  /** Castles that do not shoot, so a test sees only the tower it is about. */
  const quiet = (m: Match) => {
    for (const p of m.players) p.castle.cooldown = 1e9;
    return m;
  };
  /** An enemy (player 1) unit that stands where it is put: it does not walk, hit or tire. */
  const standing = (m: Match, race: RaceId, id: string, s: number): Unit => {
    const u: Unit = {
      id: m.nextId++,
      def: { ...unitDef(race, id), speed: 0 },
      owner: 1,
      hp: 100_000,
      s,
      cooldown: 999,
    };
    m.units.push(u);
    return u;
  };
  const damageTaken = (u: Unit) => 100_000 - u.hp;

  it('has air flown over the straight line, not the road', () => {
    const glider = { owner: 0 as Owner, s: AIR_LENGTH / 2, def: unitDef('swarm', 'glider') };
    const [x, y] = unitPos(glider);
    expect(x).toBeCloseTo((CASTLES[0][0] + CASTLES[1][0]) / 2);
    expect(y).toBeCloseTo((CASTLES[0][1] + CASTLES[1][1]) / 2);
  });

  it('lets a ground-only tower ignore air, an air-only tower ignore the ground, and a both tower shoot either', () => {
    const shotAt = (race: RaceId, id: string, unit: string, s: number) => {
      const m = quiet(newMatch([race, 'swarm']));
      put(m, 0, race, id, 8, 5);
      const u = standing(m, 'swarm', unit, s);
      run(m, 4);
      return damageTaken(u) > 0;
    };
    expect(shotAt('titan', 'ballista', 'spearman', GROUND_S)).toBe(true); // ground only: hits ground
    expect(shotAt('titan', 'ballista', 'glider', AIR_S)).toBe(false); // ...not air
    expect(shotAt('titan', 'skyguard', 'glider', AIR_S)).toBe(true); // air only: hits air
    expect(shotAt('titan', 'skyguard', 'spearman', GROUND_S)).toBe(false); // ...not ground
    expect(shotAt('legion', 'watch', 'spearman', GROUND_S)).toBe(true);
    expect(shotAt('legion', 'watch', 'glider', AIR_S)).toBe(true);
  });

  it('keeps a ground-only tower splash off an air unit standing right beside its target', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    put(m, 0, 'legion', 'catapult', 8, 5);
    m.towers[0]!.def = { ...m.towers[0]!.def, splash: 1.5 }; // a wide splash, so the glider is surely inside it
    const ground = standing(m, 'swarm', 'spearman', ROAD_LENGTH - 4.6); // on the road at (7.1, 6.5), by the flight line
    // The glider flies over the point of its line nearest the target: within the catapult's splash of it.
    const glider = standing(m, 'swarm', 'glider', airNear(unitPos(ground)));
    const [gx, gy] = unitPos(ground);
    expect(Math.hypot(unitPos(glider)[0] - gx, unitPos(glider)[1] - gy)).toBeLessThan(m.towers[0]!.def.splash);
    run(m, 4);
    expect(damageTaken(ground)).toBeGreaterThan(0);
    expect(damageTaken(glider)).toBe(0);
  });

  it('hides a cloaked unit from towers until a detector of the defender is near, and from nothing of its own side', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    put(m, 0, 'legion', 'watch', 8, 5);
    const thief = standing(m, 'swarm', 'thief', GROUND_S);
    expect(visibleTo(m, thief, 0)).toBe(false);
    expect(visibleTo(m, thief, 1)).toBe(true);
    run(m, 4);
    expect(damageTaken(thief)).toBe(0); // unseen: untouched
    put(m, 0, 'legion', 'lookout', 9, 4); // a detector, radius 5
    expect(visibleTo(m, thief, 0)).toBe(true);
    run(m, 4);
    expect(damageTaken(thief)).toBeGreaterThan(0);
  });

  it('lets a castle see cloaked units right at its gate', () => {
    const m = newMatch(['legion', 'swarm']);
    const thief = standing(m, 'swarm', 'thief', ROAD_LENGTH - 2);
    expect(visibleTo(m, thief, 0)).toBe(true); // 2 cells from player 0's castle
    thief.s = ROAD_LENGTH - 20;
    expect(visibleTo(m, thief, 0)).toBe(false);
  });

  it('burns what a poison tower hits for a while after it, and renews rather than stacks', () => {
    const m = quiet(newMatch(['swarm', 'legion']));
    put(m, 0, 'swarm', 'spitter', 8, 5);
    const u = standing(m, 'legion', 'ritter', GROUND_S);
    run(m, 1.2);
    expect(u.dot).toEqual({ dps: 6, left: expect.any(Number) as number });
    m.towers.length = 0; // out of the tower's reach, the poison still burns
    const before = u.hp;
    run(m, 2);
    expect(before - u.hp).toBeGreaterThan(5);
    run(m, 6);
    expect(u.dot).toBeUndefined();
    const after = u.hp;
    run(m, 2);
    expect(u.hp).toBe(after); // and then it stops
  });

  it('makes a power aura strengthen towers in its radius and only theirs', () => {
    const m = newMatch(['swarm', 'legion']);
    expect(powerAt(m, 0, [8.5, 4.5])).toBe(1);
    put(m, 0, 'swarm', 'temple', 9, 4);
    expect(powerAt(m, 0, [8.5, 4.5])).toBeCloseTo(1.3);
    expect(powerAt(m, 0, [20, 30])).toBe(1);
    expect(powerAt(m, 1, [8.5, 4.5])).toBe(1); // the other side's friends only
    const [plain, boosted] = [quiet(newMatch(['swarm', 'legion'])), quiet(newMatch(['swarm', 'legion']))];
    put(plain, 0, 'swarm', 'nest', 8, 5);
    put(boosted, 0, 'swarm', 'nest', 8, 5);
    put(boosted, 0, 'swarm', 'temple', 9, 4);
    const [a, b] = [standing(plain, 'legion', 'ritter', GROUND_S), standing(boosted, 'legion', 'ritter', GROUND_S)];
    run(plain, 3);
    run(boosted, 3);
    expect(damageTaken(b) / damageTaken(a)).toBeCloseTo(1.3, 1);
  });

  it('heals friends inside a heal aura, never beyond their maximum, and fires nothing itself', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    put(m, 0, 'legion', 'church', 5, 6);
    const own: Unit = {
      id: m.nextId++,
      def: { ...unitDef('legion', 'warrior'), speed: 0 },
      owner: 0,
      hp: 10,
      s: 3,
      cooldown: 999,
    };
    m.units.push(own);
    run(m, 2);
    expect(own.hp).toBeGreaterThan(15);
    run(m, 30);
    expect(own.hp).toBe(own.def.hp);
    expect(m.towers[0]?.cooldown).toBeLessThanOrEqual(0); // it never fired, so its cooldown never restarted
  });

  it('lets archers shoot air units and plain warriors not', () => {
    const exchange = (id: string) => {
      const m = quiet(newMatch(['legion', 'swarm']));
      const mine: Unit = {
        id: m.nextId++,
        def: { ...unitDef('legion', id), speed: 0 },
        owner: 0,
        hp: 100_000,
        s: 8,
        cooldown: 0,
      };
      m.units.push(mine);
      // A glider over the flight line where it crosses the road's first long run, a few cells from the attacker at (7.5, 7.5).
      const flyer = standing(m, 'swarm', 'glider', airNear([8.5, 7.5]));
      run(m, 4);
      return damageTaken(flyer);
    };
    expect(exchange('archer')).toBeGreaterThan(0);
    expect(exchange('warrior')).toBe(0);
  });

  it('keeps a support tower (no damage) from ever shooting', () => {
    const m = quiet(newMatch(['swarm', 'legion']));
    put(m, 0, 'swarm', 'academy', 8, 5);
    put(m, 0, 'swarm', 'temple', 9, 4);
    standing(m, 'legion', 'ritter', GROUND_S);
    run(m, 5);
    expect(m.towers.every((t) => t.cooldown <= 0)).toBe(true);
  });
});

describe('orders', () => {
  /** Player 0's warrior at the start of the road, with a tower of player 1 and an enemy warrior just ahead of it. */
  const setup = () => {
    const m = quiet(newMatch(['legion', 'legion']));
    put(m, 1, 'legion', 'watch', 8, 5); // right beside the road, a few cells out from player 0's castle
    const mine: Unit = {
      id: m.nextId++,
      def: { ...unitDef('legion', 'warrior'), speed: 2 },
      owner: 0,
      hp: 5000,
      s: 3,
      cooldown: 0,
    };
    const foe: Unit = {
      id: m.nextId++,
      def: { ...unitDef('legion', 'warrior'), speed: 0 },
      owner: 1,
      hp: 5000,
      s: ROAD_LENGTH - 9,
      cooldown: 999,
    };
    m.units.push(mine, foe);
    return { m, mine, foe };
  };
  const quiet = (m: Match) => {
    for (const p of m.players) p.castle.cooldown = 1e9;
    return m;
  };

  it('has units stop and attack a tower in reach by default', () => {
    const { m } = setup();
    m.towers[0]!.cooldown = 1e9; // the tower itself holds fire, so only the unit's blows count
    run(m, 6);
    expect(m.towers[0]!.hp).toBeLessThan(towerDef('legion', 'watch').hp);
  });

  it('has units walk past towers when told to, leaving them untouched and carrying on', () => {
    const { m, mine } = setup();
    m.towers[0]!.cooldown = 1e9;
    setOrder(m, 0, 'towers', 'bypass');
    const start = mine.s;
    run(m, 4);
    expect(m.towers[0]!.hp).toBe(towerDef('legion', 'watch').hp);
    expect(mine.s).toBeGreaterThan(start + 5); // it kept walking
  });

  it('has units fight opposing units by default and walk past them when told to', () => {
    const fight = setup();
    fight.m.towers.length = 0;
    run(fight.m, 12);
    expect(fight.foe.hp).toBeLessThan(5000);
    const pass = setup();
    pass.m.towers.length = 0;
    setOrder(pass.m, 0, 'units', 'bypass');
    run(pass.m, 12);
    expect(pass.foe.hp).toBe(5000);
    expect(pass.mine.s).toBeGreaterThan(fight.mine.s);
  });

  it('keeps the orders per player', () => {
    const m = newMatch(['legion', 'legion']);
    setOrder(m, 0, 'towers', 'bypass');
    expect(m.players[0].orders).toEqual({ towers: 'bypass', units: 'attack' });
    expect(m.players[1].orders).toEqual({ towers: 'attack', units: 'attack' });
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
