import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import { laneOf } from './board';
import { RACE_IDS, RACES as GAME_RACES, type RaceId } from './races';
import {
  PAY_EVERY,
  START_RES,
  TIME_LIMIT,
  UNIT_CAP,
  boostOf,
  buildReach,
  buildTower,
  buyUpgrade,
  canBuild,
  towerUnlocked,
  incomeOf,
  loadBunker,
  maxPurchases,
  powerAt,
  setFocus,
  setOrder,
  soldierCost,
  step,
  trainUnit,
  trainUnits,
  upgradeCastle,
  upgradeLacks,
  newMatch as newGameMatch,
  visibleTo,
} from './sim';
import {
  CASTLES,
  COLS,
  DEFAULT_BOARD,
  RACES,
  ROAD_CELLS,
  ROAD_LENGTH,
  ROWS,
  SCENERY_CELLS,
  cellIndex,
  damageTaken,
  dummy,
  newMatch,
  pointAt,
  put,
  quiet,
  run,
  sNear,
  spawn,
  towerDef,
  unitDef,
  unitPos,
} from './testkit';

/** A free cell near player 0's castle (inside its starting reach). */
const NEAR: [number, number] = [8, 4];
/** Where an enemy (player 1) unit stands on the road 6 cells from player 0's castle: a cell and a bit from a tower at (8, 5). */
const GROUND_S = ROAD_LENGTH - 6;
const rich = (m: ReturnType<typeof newMatch>, o: 0 | 1 = 0) => {
  m.players[o].wood = m.players[o].stone = 10_000;
  return m;
};

describe('the board', () => {
  it('has a free cell at the place the tests build on, and castles at the ends of the road', () => {
    expect(ROAD_CELLS.has(cellIndex(...NEAR))).toBe(false);
    expect(Math.hypot(CASTLES[0][0] - CASTLES[1][0], CASTLES[0][1] - CASTLES[1][1])).toBeGreaterThan(30);
  });

  it('finds the road point straight across from a tower, along one axis only', () => {
    const foot = DEFAULT_BOARD.footOf(10, 3)!; // three rows above the first long run
    expect(foot.dir).toEqual([0, -1]);
    expect(foot.d).toBeCloseTo(3);
    expect(pointAt(foot.s)[0]).toBeCloseTo(10.5);
    for (const [c, r] of [
      [8, 5],
      [20, 9],
      [3, 30],
      [12, 17],
    ] as const) {
      const f = DEFAULT_BOARD.footOf(c, r);
      if (f) expect(Math.abs(f.dir[0]) + Math.abs(f.dir[1])).toBe(1);
    }
  });
});

describe('building', () => {
  it('takes wood and stone, and refuses the road, a taken cell, a castle, the wrong tier and a cell out of reach', () => {
    const m = newMatch(['legion', 'legion']);
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('ok');
    expect(m.players[0].wood).toBe(START_RES.wood - towerDef('legion', 'watch').cost.wood);
    expect(m.players[0].stone).toBe(START_RES.stone - towerDef('legion', 'watch').cost.stone);
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('taken');
    expect(buildTower(m, 1, 'watch', ...NEAR)).toBe('taken'); // a cell is one tower's, whoever's
    expect(buildTower(m, 0, 'watch', 5, 4)).toBe('road');
    expect(buildTower(m, 0, 'watch', 7, 3)).toBe('castle');
    expect(buildTower(m, 0, 'catapult', 9, 4)).toBe('tier');
    const far = [...Array(ROWS * COLS).keys()]
      .map((i): [number, number] => [i % COLS, Math.floor(i / COLS)])
      .find(([c, r]) => !ROAD_CELLS.has(cellIndex(c, r)) && !SCENERY_CELLS.has(cellIndex(c, r)) && r > 20)!;
    expect(buildTower(m, 0, 'watch', ...far)).toBe('area'); // far from player 0's castle
    expect(buildTower(m, 0, 'nope', 9, 4)).toBe('unknown');
    expect(buildTower(m, 0, 'watch', -1, 0)).toBe('off-board');
    m.players[0].wood = 0;
    expect(buildTower(m, 0, 'watch', 12, 4)).toBe('gold');
  });

  it('wants both currencies: wood alone does not buy a tower that costs stone', () => {
    const m = newMatch(['legion', 'legion']);
    m.players[0].wood = 1000;
    m.players[0].stone = 0;
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('gold');
    m.players[0].stone = towerDef('legion', 'watch').cost.stone;
    expect(buildTower(m, 0, 'watch', ...NEAR)).toBe('ok');
  });

  it('reaches further with an upgraded castle and from a tower already built', () => {
    const m = rich(newMatch(['legion', 'legion']));
    const def = towerDef('legion', 'watch');
    const far: [number, number] = [14, 3]; // 9 cells out: beyond the first level's reach of 6 and the castle's sight of 8, inside the second's 9
    expect(canBuild(m, 0, def, ...far)).toBe('area');
    upgradeCastle(m, 0);
    expect(buildReach(m, 0)).toBe(9);
    expect(canBuild(m, 0, def, ...far)).toBe('ok');

    // A tower's own reach carries the build area on: from (6,3) a tower reaches 3 cells further.
    const m2 = rich(newMatch(['legion', 'legion']));
    expect(canBuild(m2, 0, def, 13, 4)).toBe('area');
    buildTower(m2, 0, 'watch', 10, 4);
    expect(canBuild(m2, 0, def, 13, 4)).toBe('ok');
  });

  it('keeps a limit on a kind of building and needs another one first (a tech tree)', () => {
    const m = rich(newMatch(['swarm', 'swarm']));
    // Buildings stand two and a half cells apart, so each goes on the next open cell the rules allow.
    const next = (id: string): string => {
      const def = towerDef('swarm', id);
      for (let r = 0; r < m.board.rows; r++)
        for (let c = 0; c < m.board.cols; c++)
          if (canBuild(m, 0, def, c, r) === 'ok') return buildTower(m, 0, id, c, r);
      return towerUnlocked(m, 0, def);
    };
    for (let i = 0; i < 4; i++) expect(next('hatchery')).toBe('ok'); // camps: up to PRODUCER_LIMIT
    expect(next('hatchery')).toBe('limit');
    for (let i = 0; i < 3; i++) expect(next('mill')).toBe('ok');
    expect(next('mill')).toBe('limit');
    upgradeCastle(m, 0);
    upgradeCastle(m, 0);
    expect(towerUnlocked(m, 0, towerDef('swarm', 'roost'))).toBe('needs'); // a Dread Roost wants a Bat Aerie
    expect(next('aerie')).toBe('ok');
    expect(next('roost')).toBe('ok');
  });
});

describe('money', () => {
  it('pays every pay day: the castle income, plus a mill for wood and a quarry for stone', () => {
    const m = newMatch(['swarm', 'swarm']);
    const base = RACES.swarm.castle.income[0]!;
    run(m, PAY_EVERY + 0.2);
    expect(m.players[0].wood).toBe(START_RES.wood + base.wood);
    expect(m.players[0].stone).toBe(START_RES.stone + base.stone);

    const eco = rich(newMatch(['titan', 'titan']));
    buildTower(eco, 0, 'mill', 8, 4);
    buildTower(eco, 0, 'quarry', 11, 4);
    const [wood, stone] = [eco.players[0].wood, eco.players[0].stone];
    const income = incomeOf(eco, 0);
    expect(income.wood).toBe(RACES.titan.castle.income[0]!.wood + towerDef('titan', 'mill').econ!.wood!);
    expect(income.stone).toBe(RACES.titan.castle.income[0]!.stone + towerDef('titan', 'quarry').econ!.stone!);
    run(eco, PAY_EVERY + 0.2);
    expect(eco.players[0].wood - wood).toBe(income.wood);
    expect(eco.players[0].stone - stone).toBe(income.stone);
    expect(eco.players[1].wood - wood).toBeLessThan(0); // the other side, without them, was left behind
  });

  it('stops a razed mill from paying', () => {
    const m = quiet(rich(newMatch(['legion', 'legion'])));
    const mill = put(m, 0, 'legion', 'mill', 8, 4);
    const withMill = incomeOf(m, 0).wood;
    mill.hp = 0;
    step(m, 0.05);
    expect(incomeOf(m, 0).wood).toBe(withMill - towerDef('legion', 'mill').econ!.wood!);
  });
});

describe('the castle', () => {
  it('upgrades for wood and stone, gaining hit points and income, and stops at the top', () => {
    const m = rich(newMatch(['titan', 'legion']));
    const [wood, stone] = [m.players[0].wood, m.players[0].stone];
    expect(upgradeCastle(m, 0)).toBe('ok');
    expect(upgradeCastle(m, 0)).toBe('ok');
    expect(upgradeCastle(m, 0)).toBe('max');
    expect(m.players[0].castle.level).toBe(3);
    expect(m.players[0].castle.maxHp).toBe(RACES.titan.castle.hp + 2 * RACES.titan.castle.hpPerLevel);
    const [a, b] = RACES.titan.castle.upgrades;
    expect(wood - m.players[0].wood).toBe(a!.wood + b!.wood);
    expect(stone - m.players[0].stone).toBe(a!.stone + b!.stone);
    expect(incomeOf(m, 0)).toEqual(RACES.titan.castle.income[2]);
    m.players[1].wood = 0;
    expect(upgradeCastle(m, 1)).toBe('gold');
  });
});

describe('buying units', () => {
  it('is instant: no queue, no wait, a trio for the goblin spearmen', () => {
    const m = newMatch(['swarm', 'legion']);
    expect(trainUnit(m, 0, 'spearman')).toBe('ok');
    expect(m.players[0].wood).toBe(START_RES.wood - unitDef('swarm', 'spearman').cost.wood);
    expect(m.units).toHaveLength(unitDef('swarm', 'spearman').count);
    expect(trainUnit(m, 0, 'spearman')).toBe('ok'); // and again at once, with no cooldown
    expect(m.units).toHaveLength(2 * unitDef('swarm', 'spearman').count);
    expect(trainUnit(m, 0, 'nope')).toBe('unknown');
  });

  it('lets the castle sell its base unit and needs a building for the rest', () => {
    const m = rich(newMatch(['swarm', 'swarm']));
    expect(trainUnit(m, 0, 'spearman')).toBe('ok'); // the castle's own
    expect(trainUnit(m, 0, 'archer')).toBe('needs'); // a hatchery's
    buildTower(m, 0, 'hatchery', ...NEAR);
    expect(trainUnit(m, 0, 'archer')).toBe('ok');
    expect(trainUnit(m, 0, 'boomer')).toBe('ok');
    expect(trainUnit(m, 0, 'thief')).toBe('tier'); // castle level first (and a den)
    upgradeCastle(m, 0);
    expect(trainUnit(m, 0, 'thief')).toBe('needs');
    expect(trainUnit(m, 1, 'archer')).toBe('needs'); // the other side has no hatchery
  });

  it('files a unit out of its building square to the road, then joins the road there', () => {
    const m = quiet(rich(newMatch(['swarm', 'swarm'])));
    const hatchery = put(m, 0, 'swarm', 'hatchery', ...NEAR);
    expect(trainUnit(m, 0, 'archer')).toBe('ok');
    const u = m.units[0]!;
    expect(u.off?.leaving).toBe(true);
    expect(u.off?.tower).toBe(hatchery.id);
    const foot = laneOf(m.board, u).footOf(hatchery.col, hatchery.row)!;
    expect(u.off?.dir).toEqual(foot.dir); // straight out from the building, square to the road
    expect(u.s).toBeCloseTo(foot.s, 6); // and it joins the road at the point across from the building
    for (let i = 0; i < 400 && u.off; i++) step(m, 0.05);
    expect(u.off).toBeUndefined();
    expect(u.s).toBeCloseTo(foot.s, 6);
  });

  it('locks a unit again when its building is destroyed', () => {
    const m = quiet(rich(newMatch(['titan', 'legion'])));
    const hall = put(m, 0, 'titan', 'hall', 8, 4);
    expect(trainUnit(m, 0, 'thunderer')).toBe('ok');
    hall.hp = 0;
    step(m, 0.05);
    expect(trainUnit(m, 0, 'thunderer')).toBe('needs');
  });

  it('refuses a purchase the money cannot cover in either currency, and one over the unit cap', () => {
    const m = newMatch(['legion', 'legion']);
    put(m, 0, 'legion', 'barracks', 8, 4);
    m.players[0].wood = 0;
    m.players[0].stone = 1000;
    expect(trainUnit(m, 0, 'archer')).toBe('gold'); // archers cost wood
    const full = rich(newMatch(['legion', 'legion']));
    for (let i = 0; i < UNIT_CAP; i++) trainUnit(full, 0, 'warrior');
    expect(full.units).toHaveLength(UNIT_CAP);
    expect(trainUnit(full, 0, 'warrior')).toBe('cap');
  });
});

describe('fighting', () => {
  it('has units meet between the castles and fight, the dead paying the killer a bounty', () => {
    const m = rich(newMatch(['legion', 'legion']));
    for (let i = 0; i < 4; i++) trainUnit(m, 0, 'warrior');
    for (let i = 0; i < 2; i++) trainUnit(m, 1, 'warrior');
    const [wood, wood1] = [m.players[0].wood, m.players[1].wood];
    run(m, 90); // the armies need about a minute to cross the road
    expect(m.units.length).toBeLessThan(6); // some have died
    expect(m.units.every((u) => u.s < ROAD_LENGTH)).toBe(true);
    const left = [0, 1].map((o) => m.units.filter((u) => u.owner === o).length);
    expect(left[0]).toBeGreaterThan(left[1]!); // four against two: player 0 holds more
    expect(m.players[0].wood).toBeGreaterThan(wood + incomeOf(m, 0).wood * 17); // pay days and bounty
    expect(m.players[1].wood).toBeGreaterThan(wood1);
  });

  it('has towers shoot units but never other towers, and units attack the towers in their way', () => {
    const m = newMatch(['legion', 'legion']);
    buildTower(m, 0, 'watch', 8, 5); // right beside the road, a few cells out from player 0's castle
    buildTower(m, 1, 'watch', 17, 36); // near player 1's castle
    run(m, 30);
    expect(m.towers.every((t) => t.hp === t.def.hp)).toBe(true); // nothing shot at the other's tower

    // A ritter of player 1 comes down the road to player 0's tower: it fights it (the tower's own shots hurt it too).
    spawn(m, 1, 'legion', 'ritter', ROAD_LENGTH - 6, { hp: 5000, maxHp: 5000 });
    run(m, 20);
    expect(m.towers.find((t) => t.owner === 0)?.hp ?? 0).toBeLessThan(towerDef('legion', 'watch').hp);
  });

  it('has a unit at the enemy castle hit it, and destroying a castle ends the match', () => {
    const m = newMatch(['legion', 'swarm']);
    m.players[1].castle.hp = 20;
    spawn(m, 0, 'legion', 'ritter', ROAD_LENGTH - 3, { hp: 240, maxHp: 240 });
    run(m, 15);
    expect(m.winner).toBe(0);
    expect(unitPos({ owner: 0, s: 0 })).toEqual([CASTLES[0][0], CASTLES[0][1]]);
  });

  it('reports a kill in the step it happens', () => {
    const m = newMatch(['legion', 'legion']);
    buildTower(m, 0, 'watch', ...NEAR);
    spawn(m, 1, 'legion', 'warrior', ROAD_LENGTH - 5, { hp: 1, cooldown: 99 });
    const deaths: number[] = [];
    for (let i = 0; i < 20; i++) {
      step(m, 1 / 20);
      deaths.push(m.deaths.length);
    }
    expect(deaths.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('flying', () => {
  it('has flyers follow the road, not a straight line between the castles', () => {
    const glider = { owner: 0 as const, s: 40 };
    expect(unitPos(glider)).toEqual(pointAt(40));
    expect(unitPos({ owner: 1, s: 40 })).toEqual(pointAt(ROAD_LENGTH - 40));
    const m = quiet(newMatch(['swarm', 'legion']));
    const flyer = spawn(m, 0, 'swarm', 'glider', 0, { hp: 1e6, maxHp: 1e6 });
    const seen = new Set<string>();
    for (let i = 0; i < 20 * 25; i++) {
      step(m, 0.05);
      const [x, y] = unitPos(flyer);
      expect(Math.hypot(x - pointAt(flyer.s)[0], y - pointAt(flyer.s)[1])).toBeLessThan(1e-9);
      seen.add(`${Math.round(x)},${Math.round(y)}`);
    }
    // 25 s at 6 cells a second is 150 cells of the road: it has been round its bends, not across the field.
    expect(flyer.s).toBeGreaterThan(100);
    expect(seen.size).toBeGreaterThan(100);
  });

  it('keeps the rules for air: only air-capable attackers hurt a flyer', () => {
    const shotAt = (race: RaceId, id: string, unit: string) => {
      const m = quiet(newMatch([race, 'swarm']));
      put(m, 0, race, id, 8, 5);
      const u = dummy(m, 1, 'swarm', unit, GROUND_S);
      run(m, 4);
      return damageTaken(u) > 0;
    };
    expect(shotAt('titan', 'ballista', 'spearman')).toBe(true); // ground only: hits ground
    expect(shotAt('titan', 'ballista', 'glider')).toBe(false); // ...not air
    expect(shotAt('titan', 'skyguard', 'glider')).toBe(true); // air only: hits air
    expect(shotAt('titan', 'skyguard', 'spearman')).toBe(false); // ...not ground
    expect(shotAt('swarm', 'skycannon', 'glider')).toBe(true);
    expect(shotAt('legion', 'watch', 'spearman')).toBe(true);
    expect(shotAt('legion', 'watch', 'glider')).toBe(true);
  });
});

describe('attack styles', () => {
  it('has a ranged unit hit a foe on another run of the road, across the gap', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    const ram = dummy(m, 0, 'legion', 'ram', 20); // on the first long run, y = 6.5
    ram.def = { ...ram.def, speed: 0 };
    ram.cooldown = 0;
    const [x] = unitPos(ram);
    // The next run of the road is 7 cells further down; a foe straight across from the catapult.
    const foe = dummy(m, 1, 'swarm', 'spearman', sNear(1, [x, 13.5]));
    expect(Math.abs(unitPos(foe)[1] - 13.5)).toBeLessThan(0.1);
    run(m, 6);
    expect(damageTaken(foe)).toBeGreaterThan(0);
    // A melee unit at the same spot cannot reach it.
    const m2 = quiet(newMatch(['legion', 'swarm']));
    const warrior = dummy(m2, 0, 'legion', 'warrior', 20);
    warrior.cooldown = 0;
    const foe2 = dummy(m2, 1, 'swarm', 'spearman', sNear(1, [x, 13.5]));
    run(m2, 6);
    expect(damageTaken(foe2)).toBe(0);
  });

  it('has a suicide unit blow itself up on a target, hurting everything near it, for no bounty', () => {
    const m = quiet(newMatch(['swarm', 'legion']));
    const tower = put(m, 1, 'legion', 'watch', 8, 5);
    tower.cooldown = 1e9;
    const neighbour = put(m, 1, 'legion', 'lookout', 9, 5);
    const foes = [
      dummy(m, 1, 'legion', 'warrior', ROAD_LENGTH - 5.5),
      dummy(m, 1, 'legion', 'warrior', ROAD_LENGTH - 6.2),
    ];
    const [wood, stone] = [m.players[1].wood, m.players[1].stone];
    const boomer = spawn(m, 0, 'swarm', 'boomer', 5.5);
    run(m, 4);
    expect(m.units.includes(boomer)).toBe(false); // it is gone
    expect(tower.hp).toBeLessThan(towerDef('legion', 'watch').hp - unitDef('swarm', 'boomer').damage); // the siege bonus
    expect(neighbour.hp).toBeLessThan(towerDef('legion', 'lookout').hp); // a blast, not a single target
    expect(foes.every((f) => damageTaken(f) > 0)).toBe(true);
    const bounty = m.players[1].wood - wood - 0; // pay days aside, the foe was paid nothing for the boomer
    expect(bounty).toBe(0 + Math.floor(4 / PAY_EVERY) * incomeOf(m, 1).wood);
    expect(m.players[1].stone - stone).toBe(Math.floor(4 / PAY_EVERY) * incomeOf(m, 1).stone);
  });

  it('reports a bomb going off as a death with a blast', () => {
    const m = quiet(newMatch(['swarm', 'legion']));
    const t = put(m, 1, 'legion', 'watch', 8, 5);
    t.cooldown = 1e9;
    spawn(m, 0, 'swarm', 'boomer', 5.5);
    const booms: number[] = [];
    for (let i = 0; i < 80; i++) {
      step(m, 0.05);
      for (const d of m.deaths) if (d.boom) booms.push(d.boom);
    }
    expect(booms).toEqual([unitDef('swarm', 'boomer').splash]);
  });

  it('has a sweeping unit hit several foes in one blow, up to its limit, and a plain one only one', () => {
    const setup = (id: string, race: RaceId) => {
      const m = quiet(newMatch([race, 'swarm']));
      const hero = spawn(m, 0, race, id, 30, { hp: 1e6, maxHp: 1e6 });
      hero.def = { ...hero.def, speed: 0 };
      const foes = [0, 0.1, 0.2, 0.3, 0.4].map((d) => dummy(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 31 + d));
      return { m, foes };
    };
    const sword = setup('swordsman', 'swarm');
    step(sword.m, 0.05);
    expect(sword.foes.filter((f) => damageTaken(f) > 0)).toHaveLength(unitDef('swarm', 'swordsman').multi!);
    const plain = setup('spearman', 'swarm');
    step(plain.m, 0.05);
    expect(plain.foes.filter((f) => damageTaken(f) > 0)).toHaveLength(1);
    const flame = setup('runesmith', 'titan');
    step(flame.m, 0.05);
    expect(flame.foes.filter((f) => damageTaken(f) > 0)).toHaveLength(unitDef('titan', 'runesmith').multi!);
  });

  it('has a splash unit hurt what stands near its target too', () => {
    const m = quiet(newMatch(['titan', 'swarm']));
    const rider = spawn(m, 0, 'titan', 'yale', 30, { hp: 1e6, maxHp: 1e6 });
    rider.def = { ...rider.def, speed: 0 };
    const [near, far] = [
      dummy(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 31),
      dummy(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 31.5),
    ];
    const [beyond] = [dummy(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 36)];
    step(m, 0.05);
    expect(damageTaken(near)).toBeGreaterThan(0);
    expect(damageTaken(far)).toBeGreaterThan(0);
    expect(damageTaken(beyond)).toBe(0);
  });
});

describe('leaving the road to take a tower', () => {
  /** Player 1's tower at (10, 3): three rows above the road at y = 6.5, out of a spearman's reach from the road. */
  const setup = (hp?: number) => {
    const m = quiet(newMatch(['legion', 'legion']));
    const tower = put(m, 1, 'legion', 'lookout', 10, 3); // it never shoots: a detector
    if (hp) tower.hp = hp;
    const unit = spawn(m, 0, 'legion', 'warrior', 3, { hp: 1e6, maxHp: 1e6 });
    return { m, tower, unit };
  };

  it('steps straight off the road at the tower, never diagonally, and attacks from there', () => {
    const { m, tower, unit } = setup();
    const foot = DEFAULT_BOARD.footOf(10, 3)!;
    let offSeen = false;
    for (let i = 0; i < 20 * 20; i++) {
      step(m, 0.05);
      const [x, y] = unitPos(unit);
      if (unit.off) {
        offSeen = true;
        expect(x).toBeCloseTo(pointAt(foot.s)[0]); // straight across: same column the whole way
        expect(y).toBeLessThan(6.5 + 1e-9);
        expect(y).toBeGreaterThan(3.5);
        expect(unit.s).toBeCloseTo(foot.s); // and not moving along the road meanwhile
      }
    }
    expect(offSeen).toBe(true);
    expect(tower.hp).toBeLessThan(towerDef('legion', 'lookout').hp);
  });

  it('goes back to the road when the tower falls and walks on', () => {
    const { m, unit } = setup(30);
    run(m, 20);
    expect(m.towers).toHaveLength(0);
    expect(unit.off).toBeUndefined();
    expect(unitPos(unit)[1]).toBeCloseTo(pointAt(unit.s)[1]); // back on the road itself
    const s = unit.s;
    run(m, 3);
    expect(unit.s).toBeGreaterThan(s + 5);
  });

  it('walks past the tower when told to', () => {
    const { m, tower, unit } = setup();
    setOrder(m, 0, 'towers', 'bypass');
    run(m, 12);
    expect(tower.hp).toBe(towerDef('legion', 'lookout').hp);
    expect(unit.s).toBeGreaterThan(30);
  });

  it('does not leave the road for a tower it can already reach from it, or one too far out', () => {
    const near = quiet(newMatch(['legion', 'legion']));
    put(near, 1, 'legion', 'lookout', 10, 5); // one row from the road: in reach
    const u = spawn(near, 0, 'legion', 'warrior', 3, { hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 20 * 12; i++) {
      step(near, 0.05);
      expect(u.off).toBeUndefined();
    }
    const far = quiet(newMatch(['legion', 'legion']));
    put(far, 1, 'legion', 'lookout', 10, 14); // across the next run and then some: ten or more rows from this run
    const v = spawn(far, 0, 'legion', 'warrior', 3, { hp: 1e6, maxHp: 1e6 });
    run(far, 8);
    expect(v.off).toBeUndefined();
  });
});

describe('tower roles', () => {
  const [AIR_S] = [GROUND_S];

  it('lets a ground-only tower splash stay off an air unit standing right beside its target', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    const cat = put(m, 0, 'legion', 'catapult', 8, 5);
    cat.def = { ...cat.def, splash: 1.5 }; // a wide splash, so the glider is surely inside it
    const ground = dummy(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 4.6);
    const glider = dummy(m, 1, 'swarm', 'glider', ROAD_LENGTH - 4.6);
    run(m, 4);
    expect(damageTaken(ground)).toBeGreaterThan(0);
    expect(damageTaken(glider)).toBe(0);
    void AIR_S;
  });

  it('hides a cloaked unit from towers until a detector of the defender is near, and from nothing of its own side', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    put(m, 0, 'legion', 'watch', 8, 5);
    const thief = dummy(m, 1, 'swarm', 'thief', GROUND_S);
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
    const thief = dummy(m, 1, 'swarm', 'thief', ROAD_LENGTH - 2);
    expect(visibleTo(m, thief, 0)).toBe(true); // 2 cells from player 0's castle
    thief.s = ROAD_LENGTH - 20;
    expect(visibleTo(m, thief, 0)).toBe(false);
  });

  it('burns what a poison tower hits for a while after it, and renews rather than stacks', () => {
    const m = quiet(newMatch(['swarm', 'legion']));
    put(m, 0, 'swarm', 'spitter', 8, 5);
    const u = dummy(m, 1, 'legion', 'ritter', GROUND_S);
    run(m, 1.2);
    expect(u.dot).toEqual({ dps: 6, left: expect.any(Number) as number, by: 0 });
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
    const [a, b] = [dummy(plain, 1, 'legion', 'ritter', GROUND_S), dummy(boosted, 1, 'legion', 'ritter', GROUND_S)];
    run(plain, 3);
    run(boosted, 3);
    expect(damageTaken(b) / damageTaken(a)).toBeCloseTo(1.3, 1);
  });

  it('heals friends inside a heal aura, never beyond their maximum, and fires nothing itself', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    put(m, 0, 'legion', 'church', 5, 6);
    const own = spawn(m, 0, 'legion', 'warrior', 3, { hp: 10, cooldown: 999 });
    own.def = { ...own.def, speed: 0 };
    run(m, 2);
    expect(own.hp).toBeGreaterThan(15);
    run(m, 120);
    expect(own.hp).toBe(own.def.hp);
    expect(m.towers[0]?.cooldown).toBeLessThanOrEqual(0); // it never fired, so its cooldown never restarted
  });

  it('lets archers shoot air units and plain warriors not', () => {
    const exchange = (id: string) => {
      const m = quiet(newMatch(['legion', 'swarm']));
      const mine = spawn(m, 0, 'legion', id, 8, { hp: 100_000, maxHp: 100_000 });
      mine.def = { ...mine.def, speed: 0 };
      const flyer = dummy(m, 1, 'swarm', 'glider', ROAD_LENGTH - 10);
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
    put(m, 0, 'swarm', 'mill', 10, 4);
    dummy(m, 1, 'legion', 'ritter', GROUND_S);
    run(m, 5);
    expect(m.towers.every((t) => t.cooldown <= 0)).toBe(true);
  });
});

describe('bunkers', () => {
  const bunkerMatch = () => {
    const m = quiet(rich(newMatch(['titan', 'legion'])));
    upgradeCastle(m, 0);
    put(m, 0, 'titan', 'hall', 9, 3);
    const bunker = put(m, 0, 'titan', 'bunker', 8, 5);
    bunker.def = { ...bunker.def, damage: 0 }; // its own little gun aside: what shoots is what is loaded
    return { m, bunker };
  };

  it('is loaded with ground soldiers, one at a slot, for a share of the price', () => {
    const { m, bunker } = bunkerMatch();
    const [wood, stone] = [m.players[0].wood, m.players[0].stone];
    expect(loadBunker(m, 0, bunker.id, 'thunderer')).toBe('ok');
    expect(bunker.garrison).toHaveLength(1);
    const cost = soldierCost(unitDef('titan', 'thunderer'));
    expect(wood - m.players[0].wood).toBe(cost.wood);
    expect(stone - m.players[0].stone).toBe(cost.stone);
    expect(loadBunker(m, 0, bunker.id, 'gryphon')).toBe('nobunker'); // a flyer cannot man it
    for (let i = 1; i < bunker.def.bunker!.slots; i++) loadBunker(m, 0, bunker.id, 'thunderer');
    expect(loadBunker(m, 0, bunker.id, 'thunderer')).toBe('full');
    const bare = put(m, 0, 'titan', 'ballista', 10, 4);
    expect(loadBunker(m, 0, bare.id, 'thunderer')).toBe('nobunker'); // not a bunker
    expect(loadBunker(m, 1, bunker.id, 'thunderer')).toBe('unknown'); // not the other side's
  });

  it('needs the building that unlocks the soldier, like any purchase', () => {
    const m = quiet(rich(newMatch(['legion', 'legion'])));
    const fort = put(m, 0, 'legion', 'fort', 8, 5);
    expect(loadBunker(m, 0, fort.id, 'archer')).toBe('needs');
    put(m, 0, 'legion', 'barracks', 9, 3);
    expect(loadBunker(m, 0, fort.id, 'archer')).toBe('ok');
  });

  it('has its soldiers shoot from it (further than the unit walks), air too for those that can, and an empty one fires nothing', () => {
    const { m, bunker } = bunkerMatch();
    const foe = dummy(m, 1, 'legion', 'ritter', ROAD_LENGTH - 6);
    run(m, 4);
    expect(damageTaken(foe)).toBe(0); // empty: nothing fires (its own gun is out of reach too)
    foe.def = { ...foe.def, speed: 0 };
    loadBunker(m, 0, bunker.id, 'thunderer');
    loadBunker(m, 0, bunker.id, 'thunderer');
    run(m, 4);
    expect(damageTaken(foe)).toBeGreaterThan(0);
    const few = damageTaken(foe);
    const m2 = bunkerMatch();
    const foe2 = dummy(m2.m, 1, 'legion', 'ritter', ROAD_LENGTH - 6);
    for (let i = 0; i < 4; i++) loadBunker(m2.m, 0, m2.bunker.id, 'thunderer');
    run(m2.m, 4 + 4);
    expect(damageTaken(foe2)).toBeGreaterThan(few); // four shoot more than two
    // Thunderers hit the air from there as well.
    const m3 = bunkerMatch();
    loadBunker(m3.m, 0, m3.bunker.id, 'thunderer');
    const flyer = dummy(m3.m, 1, 'swarm', 'glider', ROAD_LENGTH - 6);
    run(m3.m, 4);
    expect(damageTaken(flyer)).toBeGreaterThan(0);
  });

  it('goes down with its soldiers, and a razed bunker stops firing', () => {
    const { m, bunker } = bunkerMatch();
    loadBunker(m, 0, bunker.id, 'thunderer');
    const foe = dummy(m, 1, 'legion', 'ritter', ROAD_LENGTH - 6);
    bunker.hp = 0;
    run(m, 3);
    expect(m.towers.includes(bunker)).toBe(false);
    expect(damageTaken(foe)).toBe(0);
  });
});

describe('upgrades', () => {
  it('needs the smithy, the castle level and the money, and goes up one level at a time', () => {
    const m = rich(newMatch(['legion', 'legion']));
    expect(buyUpgrade(m, 0, 'gdmg')).toBe('needs'); // no armoury yet
    put(m, 0, 'legion', 'armoury', 8, 4);
    expect(buyUpgrade(m, 0, 'gdmg')).toBe('ok');
    expect(buyUpgrade(m, 0, 'gdmg')).toBe('tier'); // level 2 wants castle level 2
    upgradeCastle(m, 0);
    expect(buyUpgrade(m, 0, 'gdmg')).toBe('ok');
    upgradeCastle(m, 0);
    expect(buyUpgrade(m, 0, 'gdmg')).toBe('ok');
    expect(buyUpgrade(m, 0, 'gdmg')).toBe('max');
    expect(buyUpgrade(m, 0, 'nope')).toBe('unknown');
    m.players[0].wood = 0;
    expect(buyUpgrade(m, 0, 'ghp')).toBe('gold');
  });

  it('strengthens one class: ground upgrades leave the flyers alone, and the next purchase has more hit points', () => {
    const m = rich(newMatch(['titan', 'titan']));
    put(m, 0, 'titan', 'smithy', 8, 4);
    expect(boostOf(m, 0, { air: false }, 'damage')).toBe(1);
    buyUpgrade(m, 0, 'gdmg');
    buyUpgrade(m, 0, 'ghp');
    expect(boostOf(m, 0, { air: false }, 'damage')).toBeCloseTo(1.15);
    expect(boostOf(m, 0, { air: true }, 'damage')).toBe(1);
    expect(boostOf(m, 1, { air: false }, 'damage')).toBe(1); // the other side's own
    trainUnit(m, 0, 'axefighter');
    expect(m.units[0]!.hp).toBeCloseTo(unitDef('titan', 'axefighter').hp * 1.15);
    expect(m.units[0]!.maxHp).toBe(m.units[0]!.hp);
  });

  it('makes a unit hit harder', () => {
    const hit = (bought: boolean) => {
      const m = quiet(rich(newMatch(['legion', 'legion'])));
      put(m, 0, 'legion', 'armoury', 8, 4);
      if (bought) buyUpgrade(m, 0, 'gdmg');
      const hero = spawn(m, 0, 'legion', 'warrior', 30);
      hero.def = { ...hero.def, speed: 0 };
      const foe = dummy(m, 1, 'legion', 'warrior', ROAD_LENGTH - 31);
      step(m, 0.05);
      return damageTaken(foe);
    };
    expect(hit(true) / hit(false)).toBeCloseTo(1.15);
  });
});

describe('orders', () => {
  /** Player 0's warrior at the start of the road, with a tower of player 1 and an enemy warrior just ahead of it. */
  const setup = () => {
    const m = quiet(newMatch(['legion', 'legion']));
    put(m, 1, 'legion', 'watch', 8, 5); // right beside the road, a few cells out from player 0's castle
    const mine = spawn(m, 0, 'legion', 'warrior', 3, { hp: 5000, maxHp: 5000 });
    mine.def = { ...mine.def, speed: 2 };
    const foe = spawn(m, 1, 'legion', 'warrior', ROAD_LENGTH - 9, { hp: 5000, maxHp: 5000, cooldown: 999 });
    foe.def = { ...foe.def, speed: 0 };
    return { m, mine, foe };
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

describe('buying many at once', () => {
  it('buys as many as asked, never more than the money, the cap or the unlocks allow', () => {
    const m = newMatch(['swarm', 'swarm']);
    const def = RACES.swarm.units[0]!;
    const can = maxPurchases(m, 0, def);
    expect(can).toBeGreaterThan(1);
    expect(trainUnits(m, 0, def.id, 3)).toBe(3);
    expect(m.units.length).toBe(3 * def.count);
    expect(maxPurchases(m, 0, def)).toBe(can - 3);
    expect(new Set(m.units.map((u) => u.s)).size).toBe(m.units.length); // a crowd is spread out, not one stack
    expect(trainUnits(m, 0, def.id, 1000)).toBe(can - 3);
    expect(m.players[0].wood).toBeLessThan(def.cost.wood);
    expect(trainUnits(m, 0, def.id, 5)).toBe(0);
    const rich = newMatch(['swarm', 'swarm']);
    rich.players[0].wood = rich.players[0].stone = 1e9;
    expect(maxPurchases(rich, 0, def)).toBe(Math.floor(UNIT_CAP / def.count));
    const locked = RACES.swarm.units.find((u) => u.needs)!;
    expect(maxPurchases(rich, 0, locked)).toBe(0);
  });
});

describe('sending a unit after one target', () => {
  /** Player 0's warrior near the start, two enemy towers by the road (a watch and a lookout) and an enemy warrior ahead. */
  const setup = () => {
    const m = quiet(newMatch(['legion', 'legion']));
    const watch = put(m, 1, 'legion', 'watch', 8, 5);
    const lookout = put(m, 1, 'legion', 'lookout', 12, 5);
    for (const t of [watch, lookout]) t.cooldown = 1e9;
    const mine = spawn(m, 0, 'legion', 'warrior', 3, { hp: 1e6, maxHp: 1e6 });
    mine.def = { ...mine.def, speed: 2 };
    const foe = spawn(m, 1, 'legion', 'warrior', ROAD_LENGTH - 9, { hp: 5000, maxHp: 5000, cooldown: 999 });
    foe.def = { ...foe.def, speed: 0 };
    return { m, mine, foe, watch, lookout };
  };

  it('fights only the tower it was sent after, walking past the others and the foe', () => {
    const { m, mine, foe, watch, lookout } = setup();
    expect(setFocus(m, 0, [mine.id], { kind: 'tower', id: lookout.id })).toBe('ok');
    run(m, 8); // before the lookout falls and the focus ends
    expect(watch.hp).toBe(towerDef('legion', 'watch').hp);
    expect(foe.hp).toBe(5000);
    expect(lookout.hp).toBeLessThan(towerDef('legion', 'lookout').hp);
  });

  it('goes back to the general orders when that tower falls', () => {
    const { m, mine, lookout } = setup();
    lookout.hp = 20;
    setFocus(m, 0, [mine.id], { kind: 'tower', id: lookout.id });
    run(m, 10);
    expect(m.towers.find((t) => t.id === lookout.id)).toBeUndefined();
    expect(mine.focus).toBeUndefined();
  });

  it('sends a unit past every tower and unit to the castle', () => {
    const { m, mine, foe, watch } = setup();
    setFocus(m, 0, [mine.id], { kind: 'castle' });
    run(m, 10);
    expect(watch.hp).toBe(towerDef('legion', 'watch').hp);
    expect(foe.hp).toBe(5000);
    expect(mine.s).toBeGreaterThan(15);
  });

  it('clears a focus, and refuses a tower that is not an enemy, or not there', () => {
    const { m, mine, lookout } = setup();
    setFocus(m, 0, [mine.id], { kind: 'castle' });
    expect(setFocus(m, 0, [mine.id], undefined)).toBe('ok');
    expect(mine.focus).toBeUndefined();
    expect(setFocus(m, 1, [mine.id], { kind: 'castle' })).toBe('ok'); // not player 1's unit: nothing happens
    expect(mine.focus).toBeUndefined();
    expect(setFocus(m, 0, [mine.id], { kind: 'tower', id: 9999 })).toBe('unknown');
    const own = put(m, 0, 'legion', 'watch', 9, 4);
    expect(setFocus(m, 0, [mine.id], { kind: 'tower', id: own.id })).toBe('unknown');
    expect(lookout.owner).toBe(1);
  });
});

describe('the races', () => {
  it.each(RACE_IDS)('%s has a base unit, working tech, two economy buildings and varied units', (id) => {
    const race = RACES[id];
    expect(race.units.filter((u) => !u.needs)).toHaveLength(1); // the castle's own
    const towerIds = new Set(race.towers.map((t) => t.id));
    for (const u of race.units) if (u.needs) expect(race.towers.find((t) => t.id === u.needs)?.trains).toContain(u.id);
    for (const t of race.towers) {
      if (t.needs) expect(towerIds.has(t.needs)).toBe(true);
      for (const unit of t.trains ?? []) expect(race.units.some((u) => u.id === unit)).toBe(true);
    }
    for (const up of race.upgrades) expect(towerIds.has(up.needs)).toBe(true);
    expect(race.towers.filter((t) => t.econ?.wood)).toHaveLength(1);
    expect(race.towers.filter((t) => t.econ?.stone)).toHaveLength(1);
    const ground = race.units.filter((u) => !u.air);
    const air = race.units.filter((u) => u.air);
    expect(ground.length).toBeGreaterThanOrEqual(4);
    expect(air.length).toBeGreaterThanOrEqual(2);
    expect(race.upgrades.filter((u) => u.applies === 'ground').length).toBeGreaterThanOrEqual(2);
    expect(race.upgrades.filter((u) => u.applies === 'air').length).toBeGreaterThanOrEqual(2);
    // The attack styles are all there somewhere in the roster.
    expect(race.units.some((u) => u.range > 3)).toBe(true);
    // Defence: something that shoots only the air, and a bunker.
    expect(race.towers.some((t) => t.damage > 0 && t.hits === 'air')).toBe(true);
    expect(race.towers.some((t) => t.bunker)).toBe(true);
  });

  it('gives the roster every attack style between them', () => {
    const all = RACE_IDS.flatMap((r) => RACES[r].units);
    expect(all.some((u) => u.suicide && !u.air)).toBe(true);
    expect(all.some((u) => u.suicide && u.air)).toBe(true);
    expect(all.some((u) => (u.multi ?? 1) > 1)).toBe(true);
    expect(all.some((u) => (u.splash ?? 0) > 0)).toBe(true);
    expect(all.some((u) => u.range >= 7)).toBe(true);
    expect(all.some((u) => u.cloak)).toBe(true);
    expect(all.some((u) => u.hitsAir && !u.air)).toBe(true);
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

describe('castle upgrades ask for buildings, not only money', () => {
  const gameMatch = () => {
    const m = newGameMatch(['legion', 'legion']);
    m.players[0].wood = m.players[0].stone = 1e6;
    return m;
  };
  it('refuses until the buildings stand, then takes the cost', () => {
    const m = gameMatch();
    expect(upgradeLacks(m, 0).length).toBeGreaterThan(0);
    expect(upgradeCastle(m, 0)).toBe('needs');
    expect(m.players[0].castle.level).toBe(1);
    for (const [id, count] of [['watch', 2]] as const)
      for (let k = 0; k < count; k++) {
        const def = GAME_RACES.legion.towers.find((t) => t.id === id)!;
        let built = false;
        for (let r = 0; r < m.board.rows && !built; r++)
          for (let c = 0; c < m.board.cols && !built; c++)
            if (canBuild(m, 0, def, c, r) === 'ok') built = buildTower(m, 0, id, c, r) === 'ok';
        expect(built, id).toBe(true);
      }
    expect(upgradeLacks(m, 0)).toEqual([]);
    expect(upgradeCastle(m, 0)).toBe('ok');
    expect(m.players[0].castle.level).toBe(2);
    expect(upgradeLacks(m, 0).length).toBeGreaterThan(0); // the next asks for level 2 buildings
  });
});
