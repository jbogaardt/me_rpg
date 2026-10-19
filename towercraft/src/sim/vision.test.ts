import { describe, expect, it } from 'vitest';
import { createAi, foeCastle, foeTowers, foeUnits } from './ai';
import { FOG_EDGE, RACE_IDS, RACES as GAME_RACES, type RaceId, type TowerDef } from './races';
import { CASTLES, RACES, ROAD_CELLS, ROAD_LENGTH, SCENERY_CELLS, cellIndex, newMatch, unitPos } from './testkit';
import {
  CASTLE_RADIUS,
  canBuild,
  canSee,
  inBuildArea,
  isCastleSeen,
  isSeen,
  step,
  visibleTo,
  visionOf,
  type Match,
  type Owner,
  type Unit,
} from './sim';

const unitDef = (race: RaceId, id: string) => RACES[race].units.find((u) => u.id === id)!;
const towerDef = (race: RaceId, id: string) => RACES[race].towers.find((t) => t.id === id)!;
const put = (m: Match, owner: Owner, def: TowerDef, col: number, row: number) => {
  const t = { id: m.nextId++, def, owner, col, row, hp: def.hp, cooldown: 0, garrison: [] };
  m.towers.push(t);
  return t;
};
/** A unit standing still `s` cells along its owner's way (it does not walk, fight or tire). */
const stand = (m: Match, owner: Owner, race: RaceId, id: string, s: number): Unit => {
  const u: Unit = {
    id: m.nextId++,
    def: { ...unitDef(race, id), speed: 0 },
    owner,
    hp: 100_000,
    maxHp: 100_000,
    s,
    cooldown: 999,
  };
  m.units.push(u);
  return u;
};
const quiet = (m: Match) => {
  for (const p of m.players) p.castle.cooldown = 1e9;
  return m;
};
const run = (m: Match, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) step(m, 1 / 20);
};
/** Far from player 0's own sources: about the middle of the road. */
const MID = ROAD_LENGTH / 2;

describe('the sight in the data', () => {
  it('lets everything see at least as far as it attacks, detects or heals, and a castle at least its first reach', () => {
    for (const id of RACE_IDS) {
      const race = GAME_RACES[id];
      expect(race.castle.sight).toBeGreaterThanOrEqual(race.castle.reach[0]!);
      expect(race.castle.sight).toBeGreaterThanOrEqual(race.castle.range + CASTLE_RADIUS);
      expect(race.castle.sight).toBeGreaterThanOrEqual(race.castle.detect + CASTLE_RADIUS);
      for (const u of race.units) expect(u.sight, `${id} ${u.id}`).toBeGreaterThanOrEqual(u.range);
      for (const t of race.towers) {
        for (const reach of [t.range, t.detect ?? 0, t.aura?.radius ?? 0])
          expect(t.sight, `${id} ${t.id}`).toBeGreaterThanOrEqual(reach);
      }
      // Flyers see far: they look down on the whole road ahead.
      for (const u of race.units.filter((x) => x.air)) expect(u.sight, `${id} ${u.id}`).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('the fog edge', () => {
  it('keeps the fog past the longest shot of any tower, loaded bunker or castle, for everything that sees', () => {
    const shots = RACE_IDS.flatMap((id) => {
      const race = GAME_RACES[id];
      const soldier = Math.max(...race.units.filter((u) => u.garrison).map((u) => u.range));
      return [
        race.castle.range + CASTLE_RADIUS,
        ...race.towers.map((t) => t.range + (t.bunker ? t.bunker.rangeBonus + soldier : 0)),
      ];
    });
    const longest = Math.max(...shots);
    expect(FOG_EDGE).toBeGreaterThan(longest);
    for (const id of RACE_IDS) {
      const race = GAME_RACES[id];
      expect(race.castle.sight, `${id} castle`).toBeGreaterThanOrEqual(FOG_EDGE);
      for (const t of race.towers) expect(t.sight, `${id} ${t.id}`).toBeGreaterThanOrEqual(FOG_EDGE);
      for (const u of race.units) expect(u.sight, `${id} ${u.id}`).toBeGreaterThanOrEqual(FOG_EDGE);
    }
  });
});

describe('unit vision', () => {
  it('reveals the ground round a unit but never lets anyone build there', () => {
    const m = newMatch(['legion', 'legion']);
    m.players[0].wood = m.players[0].stone = 1000;
    const spot: [number, number] = [18, 10]; // beside the road, far from player 0's castle
    expect(canSee(m, 0, [spot[0] + 0.5, spot[1] + 0.5])).toBe(false);
    stand(m, 0, 'legion', 'warrior', 21); // walking the first long run of the road
    const warrior = m.units[0]!;
    const [x, y] = unitPos(warrior);
    // A free cell a couple of cells from the unit (not road, not scenery) that is outside the castle's reach.
    const near = [-2, 2, -3, 3, -4, 4]
      .map((dy): [number, number] => [Math.floor(x) + 1, Math.floor(y) + dy])
      .find(([c, r]) => !ROAD_CELLS.has(cellIndex(c, r)) && !SCENERY_CELLS.has(cellIndex(c, r)))!;
    expect(canSee(m, 0, [near[0] + 0.5, near[1] + 0.5])).toBe(true);
    expect(inBuildArea(m, 0, near[0], near[1])).toBe(false);
    expect(canBuild(m, 0, towerDef('legion', 'watch'), near[0], near[1])).toBe('area');
    expect(visionOf(m)[0]!.some((s) => s.temporary && s.build)).toBe(false);
  });

  it('goes back to fog when the unit dies or is gone', () => {
    const m = quiet(newMatch(['legion', 'legion']));
    const u = stand(m, 0, 'legion', 'warrior', MID);
    const at = unitPos(u);
    expect(canSee(m, 0, at)).toBe(true);
    u.hp = 0;
    expect(canSee(m, 0, at)).toBe(false); // dead: no sight even before the step clears it
    u.hp = 1;
    m.units.length = 0;
    expect(canSee(m, 0, at)).toBe(false);
  });

  it('does not reveal anything to the other side', () => {
    const m = newMatch(['legion', 'legion']);
    const u = stand(m, 0, 'legion', 'warrior', MID);
    expect(canSee(m, 0, unitPos(u))).toBe(true);
    expect(canSee(m, 1, unitPos(u))).toBe(false);
  });
});

describe('towers, castles and the build area', () => {
  it('keeps the build area revealed while the castle or tower stands, and builds as far as a tower or the castle sees', () => {
    const m = newMatch(['legion', 'legion']);
    const watch = towerDef('legion', 'watch');
    const t = put(m, 0, watch, 14, 5); // (put skips the build rules: this is a tower pushed far forward)
    // Inside the tower's build reach: buildable ground, and seen.
    expect(inBuildArea(m, 0, 17, 5)).toBe(true);
    expect(canSee(m, 0, [17.5, 5.5])).toBe(true);
    // A tower that extends no reach still builds as far as it sees (a made-up one); past its sight it is fog and not buildable.
    const [wide] = [{ ...watch, id: 'wide', reach: 0, sight: 9 }];
    const w = put(m, 0, wide, 14, 22);
    expect(canSee(m, 0, [16.5, 29.5])).toBe(true);
    expect(inBuildArea(m, 0, 16, 29)).toBe(true);
    expect(canSee(m, 0, [14.5, 32.5])).toBe(false);
    expect(inBuildArea(m, 0, 14, 32)).toBe(false);
    expect(canBuild(m, 0, watch, 14, 32)).toBe('area');
    m.towers.splice(m.towers.indexOf(w), 1);
    expect(canSee(m, 0, [16.5, 29.5])).toBe(false);
    m.towers.splice(m.towers.indexOf(t), 1);
    expect(inBuildArea(m, 0, 17, 5)).toBe(false);
    expect(canSee(m, 0, [17.5, 5.5])).toBe(false);
  });

  it('extends vision with each tower built far forward', () => {
    const m = newMatch(['legion', 'legion']);
    const far: [number, number] = [20, 24];
    expect(canSee(m, 0, [far[0] + 0.5, far[1] + 0.5])).toBe(false);
    put(m, 0, towerDef('legion', 'lookout'), far[0], far[1]);
    expect(canSee(m, 0, [far[0] + 0.5, far[1] + 0.5 + 6])).toBe(true);
  });

  it('has a razed tower stop seeing', () => {
    const m = quiet(newMatch(['legion', 'legion']));
    const t = put(m, 0, towerDef('legion', 'lookout'), 20, 24);
    expect(canSee(m, 0, [20.5, 28])).toBe(true);
    t.hp = 0;
    run(m, 0.1);
    expect(m.towers).toHaveLength(0);
    expect(canSee(m, 0, [20.5, 28])).toBe(false);
  });
});

describe('what is hidden', () => {
  it('shows an own unit, tower and castle always, and an enemy one only inside sight', () => {
    const m = newMatch(['legion', 'swarm']);
    const mine = stand(m, 0, 'legion', 'warrior', MID);
    const foe = stand(m, 1, 'swarm', 'spearman', 10); // 10 cells along from player 1's castle
    const mineT = put(m, 0, towerDef('legion', 'watch'), 8, 5);
    const foeT = put(m, 1, towerDef('swarm', 'nest'), 27, 49);
    expect(isSeen(m, 0, mine)).toBe(true);
    expect(isSeen(m, 1, mine)).toBe(false);
    expect(isSeen(m, 0, mineT)).toBe(true);
    expect(isSeen(m, 1, mineT)).toBe(false);
    expect(isCastleSeen(m, 0, 0)).toBe(true);
    expect(isCastleSeen(m, 0, 1)).toBe(false);
    expect(isSeen(m, 0, foe)).toBe(false);
    expect(isSeen(m, 0, foeT)).toBe(false);
    // A unit of player 0 walks up to them.
    mine.s = ROAD_LENGTH - 6;
    expect(isSeen(m, 0, foe)).toBe(true);
    expect(isSeen(m, 0, foeT)).toBe(true);
    mine.s = ROAD_LENGTH - 3;
    expect(isCastleSeen(m, 0, 1)).toBe(true);
  });

  it('keeps a tower from shooting what its owner cannot see, and has it shoot what any of the owner sources see', () => {
    // A made-up tower that shoots further than it sees (the real ones never do), to prove the tower asks its owner's sight.
    const blind: TowerDef = { ...towerDef('legion', 'guard'), range: 8, sight: 1 };
    const m = quiet(newMatch(['legion', 'swarm']));
    put(m, 0, blind, 8, 5);
    const foe = stand(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 12); // 12 cells down the road from player 0's castle, beyond its sight
    run(m, 4);
    expect(100_000 - foe.hp).toBe(0); // in range, unseen: untouched
    stand(m, 0, 'legion', 'warrior', 8); // another source of player 0 sees it
    expect(isSeen(m, 0, foe)).toBe(true);
    run(m, 4);
    expect(100_000 - foe.hp).toBeGreaterThan(0);
  });

  it('keeps splash off a unit that is out of sight', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    // A tower that shoots and splashes far but sees little of its own (made up): it hits only what other sources of its owner see.
    put(m, 0, { ...towerDef('legion', 'catapult'), splash: 8, sight: 1, range: 7 }, 8, 5);
    const seer = stand(m, 0, 'legion', 'warrior', 7.5);
    seer.def = { ...seer.def, sight: 2 }; // at (7, 7.5), seeing a little round it
    const seen = stand(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 8); // at (7.5, 7.5), 0.5 from the seer
    const hidden = stand(m, 1, 'swarm', 'spearman', ROAD_LENGTH - 12.5); // at (12, 7.5): in the splash, out of sight
    expect(isSeen(m, 0, seen)).toBe(true);
    expect(isSeen(m, 0, hidden)).toBe(false);
    run(m, 3);
    expect(100_000 - seen.hp).toBeGreaterThan(0);
    expect(100_000 - hidden.hp).toBe(0);
  });

  it('has a cloaked unit need both a unit of the viewer that sees it and a detector', () => {
    const m = quiet(newMatch(['legion', 'swarm']));
    const thief = stand(m, 1, 'swarm', 'thief', ROAD_LENGTH - 14); // at (13.5, 7.5), beyond the castle's sight
    const lookout = towerDef('legion', 'lookout');
    expect(canSee(m, 0, unitPos(thief))).toBe(false);
    // Sight without a detector: a watch tower sees it.
    const watch = put(m, 0, towerDef('legion', 'watch'), 12, 5);
    expect(canSee(m, 0, unitPos(thief))).toBe(true);
    expect(visibleTo(m, thief, 0)).toBe(false);
    expect(isSeen(m, 0, thief)).toBe(false);
    m.towers.splice(m.towers.indexOf(watch), 1);
    // A detector without sight (made up: it detects but sees nothing round it).
    const deaf = put(m, 0, { ...lookout, sight: 0.1, reach: 0 }, 12, 5);
    expect(visibleTo(m, thief, 0)).toBe(true);
    expect(canSee(m, 0, unitPos(thief))).toBe(false);
    expect(isSeen(m, 0, thief)).toBe(false);
    // Both: the real lookout sees and detects.
    m.towers.splice(m.towers.indexOf(deaf), 1);
    put(m, 0, lookout, 12, 5);
    expect(isSeen(m, 0, thief)).toBe(true);
    // And the thief's own side always sees it.
    expect(isSeen(m, 1, thief)).toBe(true);
  });

  it('lets a unit attack a tower only once it sees it, and a fogged tower blocks nothing', () => {
    const m = quiet(newMatch(['legion', 'legion']));
    const foeT = put(m, 1, towerDef('legion', 'watch'), 6, 12); // beside the road's second run back
    foeT.cooldown = 1e9;
    const walker: Unit = {
      id: m.nextId++,
      def: { ...unitDef('legion', 'warrior'), speed: 2 },
      owner: 0,
      hp: 5000,
      maxHp: 5000,
      s: 3,
      cooldown: 0,
    };
    m.units.push(walker);
    expect(isSeen(m, 0, foeT)).toBe(false);
    run(m, 1);
    expect(walker.s).toBeGreaterThan(3); // walking on: the unseen tower did not stop it
    expect(foeT.hp).toBe(foeT.def.hp);
    run(m, 40);
    expect(foeT.hp).toBeLessThan(foeT.def.hp); // it came into sight, and was attacked
  });
});

describe('the computer opponent', () => {
  it('does not order a rush on a castle it cannot see, but does once it sees it', () => {
    const m = quiet(newMatch(['legion', 'legion']));
    m.players[1].castle.hp = 100; // far below 60%
    for (let i = 0; i < 4; i++) stand(m, 0, 'legion', 'warrior', 10 + i);
    const ai = createAi(0, 1);
    ai(m, 1);
    expect(m.players[0].orders.towers).toBe('attack'); // it cannot see the wounded castle
    for (const u of m.units) u.s = ROAD_LENGTH - 6;
    expect(isCastleSeen(m, 0, 1)).toBe(true);
    ai(m, 1);
    expect(m.players[0].orders.towers).toBe('bypass');
    expect(CASTLES[1][1]).toBeGreaterThan(30);
  });

  it('reads the other side only through what it can see (foeUnits, foeTowers, foeCastle)', () => {
    const m = quiet(newMatch(['swarm', 'titan']));
    put(m, 1, towerDef('titan', 'skyguard'), 27, 49); // a tower deep in the other half
    const far = stand(m, 1, 'titan', 'axefighter', 6); // on the road 6 cells from its own castle
    expect(foeTowers(m, 0)).toHaveLength(0);
    expect(foeUnits(m, 0)).not.toContain(far);
    expect(foeCastle(m, 0)).toBeUndefined();
    // A unit of the AI's own walking down toward them sees all three.
    stand(m, 0, 'swarm', 'spearman', ROAD_LENGTH - 4);
    expect(foeTowers(m, 0)).toHaveLength(1);
    expect(foeUnits(m, 0)).toContain(far);
    expect(foeCastle(m, 0)).toBeDefined();
    // The other side's reads are its own: it does not see the AI's far unit.
    expect(foeUnits(m, 1).length).toBeLessThanOrEqual(1);
  });
});
