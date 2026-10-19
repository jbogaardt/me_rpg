// The computer opponent (Pixi-free). It thinks twice a second, with a seeded random source so a match replays. Its plan:
//  - ECONOMY first: mills and quarries on cells near its castle, as many as the time allows, so there is money to spend.
//  - TECH: producer buildings (they unlock the units) and a smithy for upgrades, in order of the castle level they need, so the army
//    grows more varied as the match goes on; upgrades are bought when there is money to spare.
//  - MASS, then send: resources are saved until a wave is affordable, then the whole wave is bought at once (instantly), so it
//    marches together. A wave is also bought early when the foe is at the gate or the AI is rich, so money is never hoarded.
//  - UPGRADE the castle on a schedule (a minimum time per level, and a tower or two first), saving for it rather than spending.
//  - DEFENCE: a goal count that grows with the castle's level, an attacker where it covers the most road, pushed toward the foe
//    tower by tower (towers with `reach` extend the build area), a detector against cloaked units, an anti-air tower against air,
//    one aura of each kind among its towers, bunkers that it loads with ranged units; none that the foe cannot be hurt by.
//  - ORDERS: normally units fight towers and units; with an army that could take the castle down in a few seconds they walk past the
//    towers (`bypass`) and finish it.
// Everything it knows about the other side is read through `foeUnits`, `foeTowers` and `foeCastle` below, which show only what its
// vision (castle, towers and living units, as for the player) shows: it plays by the same fog.

import { CASTLES, COLS, ROAD_CELLS, ROAD_LENGTH, ROWS, cellIndex, pointAt } from './board';
import { MAX_LEVEL, type Cost, type TowerDef, type UnitDef } from './races';
import {
  UNIT_CAP,
  boostOf,
  buildTower,
  buyUpgrade,
  canAfford,
  canBuild,
  enemy,
  hasBuilding,
  isCastleSeen,
  isSeen,
  loadBunker,
  nextUpgrade,
  raceOf,
  setOrder,
  soldierCost,
  towerUnlocked,
  trainUnit,
  unitUnlocked,
  upgradeCastle,
  upgradeCost,
  visionOf,
  type Castle,
  type Match,
  type Owner,
  type Tower,
  type Unit,
} from './sim';

/** A small seeded random source (mulberry32): same seed, same sequence. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points along the road, half a cell apart: what "covering the road" is counted over. */
const ROAD_SAMPLES: [number, number][] = Array.from({ length: Math.floor(ROAD_LENGTH * 2) }, (_, i) => pointAt(i / 2));

/** How much road a tower of this range would cover from each cell, and where along the road (cells from player 0's end): cached, the road never changes. */
const coverage = new Map<string, { n: number; at: number }>();
function coverageOf(col: number, row: number, range: number): { n: number; at: number } {
  const key = `${cellIndex(col, row)}:${range}`;
  let c = coverage.get(key);
  if (!c) {
    let [n, sum] = [0, 0];
    ROAD_SAMPLES.forEach(([x, y], i) => {
      if (Math.hypot(x - col - 0.5, y - row - 0.5) > range) return;
      n++;
      sum += i / 2;
    });
    c = { n, at: n ? sum / n : 0 };
    coverage.set(key, c);
  }
  return c;
}

/** What a building is for, for deciding where it goes and when it is needed. */
export type Role = 'attack' | 'detect' | 'aura' | 'bunker' | 'econ' | 'prod' | 'smith';
export const roleOf = (def: TowerDef): Role =>
  def.econ
    ? 'econ'
    : def.trains
      ? 'prod'
      : def.bunker
        ? 'bunker'
        : def.damage > 0
          ? 'attack'
          : def.detect
            ? 'detect'
            : def.aura
              ? 'aura'
              : 'smith';
/** Buildings that fight or help in the field (as against the ones that make money, unlock units or upgrade them). */
const defensive = (def: TowerDef) => ['attack', 'detect', 'aura', 'bunker'].includes(roleOf(def));
const isAntiAir = (d: TowerDef) => d.damage > 0 && d.hits !== 'ground';
/** What a loaded soldier is assumed to reach from a bunker, for choosing where one goes. */
const BUNKER_REACH = 5.5;

/** How much a cell is worth for each cell it lies nearer the enemy castle along the road: pushes the front line forward. */
const PUSH = 0.5;
/** Road samples (half a cell each) beyond which more coverage adds nothing: any cell beside the road sees enough of it. */
const ENOUGH = 10;

/** How good a cell is for this building: enough road covered by what it shoots or sees, then as far forward as it can go; friends an aura would reach. */
function score(m: Match, owner: Owner, def: TowerDef, col: number, row: number): number {
  const role = roleOf(def);
  const centre = CASTLES[owner];
  // Money, unlocks and upgrades sit safe and close: the nearest free cells to the castle.
  if (role === 'econ' || role === 'prod' || role === 'smith')
    return -Math.hypot(centre[0] - col - 0.5, centre[1] - row - 0.5);
  if (role === 'aura') {
    const foe = CASTLES[enemy(owner)];
    const friends = m.towers.filter(
      (t) => t.owner === owner && Math.hypot(t.col - col, t.row - row) <= (def.aura?.radius ?? 0),
    ).length;
    return friends * 12 - Math.hypot(foe[0] - col - 0.5, foe[1] - row - 0.5) * 0.15;
  }
  const range = role === 'detect' ? (def.detect ?? 0) : role === 'bunker' ? BUNKER_REACH : def.range;
  const c = coverageOf(col, row, range);
  if (c.n === 0) return -Infinity; // it would see no road at all
  const progress = owner === 0 ? c.at : ROAD_LENGTH - c.at;
  return Math.min(c.n, ENOUGH) + progress * PUSH;
}

/** The cell `owner` may build this tower on that serves it best, if any is free. */
export function bestCell(m: Match, owner: Owner, def: TowerDef): [number, number] | undefined {
  let best: [number, number] | undefined;
  let bestScore = -Infinity;
  // Ties go to the first cell met, and each side scans from its own castle outward in the same way, so neither is favoured.
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      const [row, col] = owner === 0 ? [r, k] : [ROWS - 1 - r, COLS - 1 - k];
      if (ROAD_CELLS.has(cellIndex(col, row)) || canBuild(m, owner, def, col, row) !== 'ok') continue;
      const sc = score(m, owner, def, col, row);
      if (sc > bestScore) {
        bestScore = sc;
        best = [col, row];
      }
    }
  }
  return best;
}

// --- What the AI knows of the other side: only what its vision shows (the same rules as the player's fog) -------------------------

/** The other side's units the AI can see. */
export const foeUnits = (m: Match, owner: Owner): Unit[] => {
  const vision = visionOf(m);
  return m.units.filter((u) => u.owner === enemy(owner) && isSeen(m, owner, u, vision));
};
/** The other side's towers the AI can see. */
export const foeTowers = (m: Match, owner: Owner): Tower[] => {
  const vision = visionOf(m);
  return m.towers.filter((t) => t.owner === enemy(owner) && isSeen(m, owner, t, vision));
};
/** The other side's castle, or nothing while it is out of sight (so a rush is never planned on a castle it cannot see). */
export const foeCastle = (m: Match, owner: Owner): Castle | undefined =>
  isCastleSeen(m, owner, enemy(owner)) ? m.players[enemy(owner)].castle : undefined;

const ownUnits = (m: Match, owner: Owner) => m.units.filter((u) => u.owner === owner);
const ownTowers = (m: Match, owner: Owner) => m.towers.filter((t) => t.owner === owner);
const dps = (u: UnitDef) => (u.damage * (u.multi ?? 1)) / u.cooldown;
/** Cells (along its way) between an enemy unit and this side's castle. */
const fromCastle = (u: Unit) => ROAD_LENGTH - u.s;
const total = (c: Cost) => c.wood + c.stone;

/** Which defensive building does `owner` need most right now? It answers what the other side has sent or can send: air, cloaked units. */
function chooseTower(m: Match, owner: Owner, options: TowerDef[], random: () => number): TowerDef | undefined {
  if (!options.length) return undefined;
  const mine = ownTowers(m, owner);
  const race = raceOf(m, owner);
  const foeRace = raceOf(m, enemy(owner));
  const sees = (hits: (t: TowerDef) => boolean) => mine.filter((t) => hits(t.def)).length;
  const air = foeUnits(m, owner).some((u) => u.def.air);
  const canAir = foeRace.units.some((u) => u.air);
  const antiAir = sees(isAntiAir);
  const cloaked = foeUnits(m, owner).some((u) => u.def.cloak) || foeRace.units.some((u) => u.cloak);
  const detectors = sees((d) => !!d.detect);
  const bunkers = mine.filter((t) => t.def.bunker);
  const loadable = race.units.some((u) => u.garrison && unitUnlocked(m, owner, u) === 'ok');
  const weight = (def: TowerDef) => {
    const role = roleOf(def);
    if (def.detect) return cloaked && detectors < 1 ? 5 : detectors < 1 ? 0.3 : 0.05; // once, early enough that they are not free
    if (role === 'aura')
      return mine.length >= 3 && sees((d) => d.aura?.kind === def.aura?.kind) < 1 ? AURA_WEIGHT : 0.05; // once there are towers to help
    if (role === 'bunker') {
      // Only worth it while there are ranged units to put in: one at a time, when the last is nearly full.
      const room = bunkers.reduce((n, t) => n + (t.def.bunker!.slots - t.garrison.length), 0);
      return loadable && room <= 1 && bunkers.length < 3 ? 1.6 : 0.05;
    }
    let w = 1 + (def.splash > 0 || def.dot ? 0.5 : 0);
    if (def.hits !== 'ground') w += air ? 4 / (1 + antiAir) : canAir && antiAir < 1 ? 1.5 : 0;
    if (def.hits === 'air') w = air || (canAir && antiAir < 1) ? w : 0.1; // an air-only tower is wasted with no air about
    return w;
  };
  return pickWeighted(options, options.map(weight), random);
}

const AURA_WEIGHT = 2.5;

function pickWeighted<T>(options: T[], weights: number[], random: () => number): T {
  let roll = random() * weights.reduce((a, b) => a + Math.max(0.05, b), 0);
  for (let i = 0; i < options.length; i++) {
    roll -= Math.max(0.05, weights[i]!);
    if (roll <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

/** Which unit to train: leaning to air where the other side has nothing up, cloaked where it has no detector, archers against air, bombs against towers, sweeps against crowds. */
function chooseUnit(m: Match, owner: Owner, options: UnitDef[], random: () => number): UnitDef | undefined {
  if (!options.length) return undefined;
  const towers = foeTowers(m, owner);
  const noAntiAir = !towers.some((t) => isAntiAir(t.def));
  const noDetector = !towers.some((t) => t.def.detect);
  const foes = foeUnits(m, owner);
  const foeAir = foes.filter((u) => u.def.air).length;
  const myShooters = ownUnits(m, owner).filter((u) => u.def.hitsAir).length;
  const crowd = foes.length >= 6;
  const weights = options.map(
    (u) =>
      1 +
      u.tier * 0.5 +
      (u.air && noAntiAir ? 3 : 0) +
      (u.cloak && noDetector ? 2 : 0) +
      (u.air && !noAntiAir ? -2 : 0) +
      (u.hitsAir && foeAir > myShooters ? 3 : 0) +
      (u.suicide ? (towers.length >= 3 ? 1.5 : -0.5) : 0) +
      (u.multi && crowd ? 1.5 : 0) +
      (u.range > 3 ? 0.5 : 0),
  );
  return pickWeighted(options, weights, random);
}

/** The units of one wave, as many as the money and the cap allow: what it would like, or failing the money for that, the best it can pay for. */
function pickWave(m: Match, owner: Owner, options: UnitDef[], random: () => number): UnitDef[] {
  const wave: UnitDef[] = [];
  const left = { wood: m.players[owner].wood, stone: m.players[owner].stone };
  let room = UNIT_CAP - ownUnits(m, owner).length;
  while (wave.length < WAVE_MAX) {
    const ok = options.filter((u) => canAfford(left, u.cost) && u.count <= room);
    const want = chooseUnit(m, owner, options, random);
    const pick = want && ok.includes(want) ? want : chooseUnit(m, owner, ok, random);
    if (!pick) break;
    left.wood -= pick.cost.wood;
    left.stone -= pick.cost.stone;
    room -= pick.count;
    wave.push(pick);
  }
  return wave;
}
/** The fewest units a wave is worth sending (unless the foe is at the gate): it grows by one every `WAVE_GROWS` seconds, to a cap, so late waves are armies that break defences, not trickles. */
const MIN_WAVE = 3;
const WAVE_GROWS = 1e9;
const MAX_MIN_WAVE = 16;
/** The most purchases in one wave (a purchase is a group of one to three units). */
const WAVE_MAX = 12;

/** The tower this side must have now to answer what the foe fields (or surely will): a detector for cloaked units, a shooter for air. */
function answerTower(m: Match, owner: Owner, defs: TowerDef[]): TowerDef | undefined {
  const mine = ownTowers(m, owner);
  const [foe, foeRace] = [foeUnits(m, owner), raceOf(m, enemy(owner))];
  const cheapest = (ok: (d: TowerDef) => boolean) =>
    defs.filter(ok).sort((a, b) => a.tier - b.tier || total(a.cost) - total(b.cost))[0];
  const cloaked = foe.filter((u) => u.def.cloak).length;
  const detectors = mine.filter((t) => t.def.detect).length;
  if (
    (cloaked > 0 || (foeRace.units.some((u) => u.cloak) && m.time > DETECTOR_BY)) &&
    detectors < (cloaked >= 8 ? 2 : 1)
  )
    return cheapest((d) => !!d.detect);
  const air = foe.filter((u) => u.def.air).length;
  const shooters = mine.filter((t) => isAntiAir(t.def)).length;
  if (air > 0 && shooters < 1 + Math.floor(air / 3)) return cheapest(isAntiAir);
  return undefined;
}

// --- Plan -----------------------------------------------------------------------------------------------------------------------------

const THINK_EVERY = 0.5;
/** Seconds into the match by which a side whose foe can field cloaked units has a detector standing. */
const DETECTOR_BY = 90;
/** The most defensive towers the AI keeps. */
const MAX_TOWERS = 6;
/** A foe closer than this many cells to the castle is an emergency: units are bought at once. */
const ALARM = 24;
/** The army walks past the foe's units only when it would kill their castle in under this share of the time theirs would kill ours. */
const RACE_MARGIN = 0.6;
/** Upgrades wait until this many units have been bought, and are bought only with this much money (of each currency) to spare. */
const UPGRADE_ARMY = 6;

/**
 * How one game of the AI is played, drawn from its seed. Two equal armies cancel out on the road, so a match between sides
 * that played alike would never end; sides that play differently (a quick small wave, or a big late one; towers or none; money
 * first or tech first) win, lose and leak units to the castle, and each style beats some of the others. Every side draws from
 * the same ranges, so no race or side is favoured by it.
 */
export interface Style {
  /** Seconds between waves: all the money there is then goes on one wave, so it marches together. */
  waveEvery: number;
  /** Earliest time (seconds) the castle is raised to level 2 and to level 3. */
  upgradeAfter: [number, number];
  /** Towers wanted at the start of the match. */
  towerStart: number;
  /** Then one more tower for every this many seconds. */
  towerEvery: number;
  /** One more mill or quarry for every this many seconds (after the first of each). */
  ecoEvery: number;
  /** Producer buildings wanted at the start, then one more for every `techEvery` seconds. */
  techStart: number;
  techEvery: number;
  /** The army walks past towers when it could kill the castle in this many seconds (grows as the match drags on). */
  siege: number;
  /** From this time (seconds) a stalemate is broken by running past the foe's army to its castle. */
  rush: number;
}

export function styleFor(random: () => number): Style {
  const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const a = between(30, 90);
  return {
    waveEvery: between(20, 50),
    upgradeAfter: [a, a + between(80, 240)],
    towerStart: between(1, 3),
    towerEvery: between(50, 120),
    ecoEvery: between(30, 70),
    techStart: between(1, 2),
    techEvery: between(45, 90),
    siege: between(15, 40),
    rush: between(300, 540),
  };
}

/** The AI for player `owner`: call the returned function every step with the match and the step's length. */
export function createAi(owner: Owner, seed: number): (m: Match, dt: number) => void {
  // Neighbouring seeds (the two sides of a match) must not give neighbouring styles: scramble the seed first.
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const random = seeded((h ^ (h >>> 16)) >>> 0);
  const style = styleFor(random);
  let timer = 0;
  let lastWave = 0;
  let bought = 0;
  return (m, dt) => {
    if (m.winner >= 0) return;
    timer += dt;
    if (timer < THINK_EVERY) return;
    timer -= THINK_EVERY;
    const me = m.players[owner];
    const race = raceOf(m, owner);
    const level = me.castle.level;
    const mine = ownUnits(m, owner);
    const towers = ownTowers(m, owner);
    const defence = towers.filter((t) => defensive(t.def));

    // Orders: fight everything, unless the army could take the castle down fast, then walk past the towers (and, when the foe's
    // army could not do the same to ours first, past its units too: a race to the castles) and do it. The patience for it
    // shrinks as the match drags on, so a stalemate does not last.
    const myDps = mine.reduce((a, u) => a + dps(u.def) * boostOf(m, owner, u.def, 'damage'), 0);
    const foeDps = foeUnits(m, owner).reduce((a, u) => a + dps(u.def), 0);
    const seenCastle = foeCastle(m, owner);
    const killIn = seenCastle ? seenCastle.hp / Math.max(1, myDps) : Infinity;
    const diesIn = me.castle.hp / Math.max(1, foeDps);
    const patience = style.siege + m.time / 15;
    setOrder(m, owner, 'towers', killIn <= patience ? 'bypass' : 'attack');
    const race2 = killIn <= patience && killIn < diesIn * RACE_MARGIN;
    setOrder(m, owner, 'units', race2 || m.time >= style.rush ? 'bypass' : 'attack');

    const threat = Math.min(Infinity, ...foeUnits(m, owner).map(fromCastle));
    const alarm = threat < ALARM;

    // What the foe fields decides one tower the AI must have (and so maybe a castle level to build it).
    const answer = answerTower(m, owner, race.towers);
    const mustUp = answer !== undefined && answer.tier > level;

    // Up a level once the time is right and a tower or two stand; save for it (but not while the foe is at the gate).
    const cost = upgradeCost(m, owner);
    const wantUp =
      level < MAX_LEVEL &&
      cost !== undefined &&
      (mustUp || (m.time >= style.upgradeAfter[level - 1]! && towers.length >= 1));
    if (wantUp && canAfford(me, cost)) {
      upgradeCastle(m, owner);
      return;
    }
    const saving = wantUp && !alarm;

    // The answering tower first (saving for it if need be).
    if (answer && !mustUp) {
      const cell = canAfford(me, answer.cost) ? bestCell(m, owner, answer) : undefined;
      if (cell) {
        buildTower(m, owner, answer.id, cell[0], cell[1]);
        return;
      }
      if (!alarm && !cell && !canAfford(me, answer.cost)) return;
    }

    if (!saving || towers.length < 1) {
      // Money buildings: one of each early, then as the time allows, whichever the AI has fewer of (it needs both).
      const count = (id: string) => towers.filter((t) => t.def.id === id).length;
      const ecoDefs = race.towers.filter((t) => t.econ && t.tier <= level);
      const ecoGoal = Math.min(6, 2 + Math.floor(m.time / style.ecoEvery));
      const ecoNow = towers.filter((t) => t.def.econ).length;
      if (ecoNow < ecoGoal && !(alarm && ecoNow >= 2)) {
        const order = [...ecoDefs].sort((a, b) => count(a.id) - count(b.id) || total(a.cost) - total(b.cost));
        const def = order.find((d) => towerUnlocked(m, owner, d) === 'ok' && canAfford(me, d.cost));
        const cell = def && bestCell(m, owner, def);
        if (def && cell) {
          buildTower(m, owner, def.id, cell[0], cell[1]);
          return;
        }
      }

      // Tech: the producers (and the smithy) the castle level allows, cheapest tier first, a few more as the time goes by.
      const techGoal = style.techStart + Math.floor(m.time / style.techEvery);
      const techNow = towers.filter((t) => t.def.trains || roleOf(t.def) === 'smith').length;
      if (techNow < techGoal && !alarm) {
        const missing = race.towers
          .filter(
            (t) =>
              (t.trains || roleOf(t) === 'smith') &&
              t.tier <= level &&
              !hasBuilding(m, owner, t.id) &&
              (!t.needs || hasBuilding(m, owner, t.needs)),
          )
          .sort((a, b) => a.tier - b.tier || total(a.cost) - total(b.cost));
        const def = missing.find((d) => canAfford(me, d.cost));
        // Wait for the money for the first on the list rather than build something dearer or lesser around it.
        if (missing.length && !def && !alarm) return;
        const cell = def && bestCell(m, owner, def);
        if (def && cell) {
          buildTower(m, owner, def.id, cell[0], cell[1]);
          return;
        }
      }

      // Defence: towers up to the goal for the time.
      if (defence.length < Math.min(MAX_TOWERS, style.towerStart + m.time / style.towerEvery)) {
        const def = chooseTower(
          m,
          owner,
          race.towers.filter((t) => defensive(t) && canAfford(me, t.cost) && towerUnlocked(m, owner, t) === 'ok'),
          random,
        );
        const cell = def && bestCell(m, owner, def);
        if (def && cell) {
          buildTower(m, owner, def.id, cell[0], cell[1]);
          return;
        }
      }
    }
    if (saving) return;

    // Soldiers for the bunkers (a bunker stands for nothing without them), and upgrades once the army is worth improving.
    for (const t of towers) {
      if (!t.def.bunker || t.garrison.length >= t.def.bunker.slots) continue;
      const shooters = race.units
        .filter((u) => u.garrison && unitUnlocked(m, owner, u) === 'ok')
        .sort((a, b) => total(soldierCost(b)) - total(soldierCost(a)));
      const pick = shooters.find((u) => canAfford(me, soldierCost(u)));
      if (pick) loadBunker(m, owner, t.id, pick.id);
    }
    if (bought >= UPGRADE_ARMY && !alarm) {
      const ground = mine.filter((u) => !u.def.air).length;
      const air = mine.length - ground;
      const options = race.upgrades
        .filter((up) => {
          const next = nextUpgrade(m, owner, up);
          return next && next.tier <= level && hasBuilding(m, owner, up.needs);
        })
        .sort((a, b) => (b.applies === 'air' ? air : ground) - (a.applies === 'air' ? air : ground));
      const up = options[0];
      const next = up && nextUpgrade(m, owner, up);
      // Bought only from money to spare: the next wave is not starved for it.
      if (up && next && me.wood >= next.cost.wood * 1.5 && me.stone >= next.cost.stone * 1.5)
        buyUpgrade(m, owner, up.id);
    }

    // Units, in waves: save up, then buy the whole wave at once so it marches together.
    const options = race.units.filter((u) => unitUnlocked(m, owner, u) === 'ok');
    const cheapest = Math.min(...options.map((u) => total(u.cost)));
    // A wave also goes at once when the money would fill the whole wave: a rich side does not sit on its money.
    const rich = total(me) >= WAVE_MAX * (options.reduce((a, u) => a + total(u.cost), 0) / options.length);
    const ready = total(me) >= cheapest * 3 && (rich || m.time - lastWave >= style.waveEvery);
    if (!ready && !alarm) return;
    const wave = pickWave(m, owner, options, random);
    // Never a trickle: unless the foe is at the gate, wait until the money (of both kinds) buys a few units at least.
    if (!alarm && wave.reduce((n, u) => n + u.count, 0) < Math.min(MAX_MIN_WAVE, MIN_WAVE + m.time / WAVE_GROWS))
      return;
    for (const def of wave) trainUnit(m, owner, def.id);
    if (wave.length) {
      lastWave = m.time;
      bought += wave.length;
    }
  };
}
