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

import { hypot } from './hypot';
import { laneOf, type Board } from './board';
import { MAX_LEVEL, REACH_SCALE, type Cost, type TowerDef, type UnitDef } from './races';
import {
  UNIT_CAP,
  boostOf,
  buildTower,
  buyUpgrade,
  canAfford,
  canBuild,
  foesOf,
  hasBuilding,
  isCastleSeen,
  isSeen,
  loadBunker,
  nextUpgrade,
  openLanes,
  raceOf,
  setLane,
  setOrder,
  soldierCost,
  towerUnlocked,
  trainUnit,
  unitUnlocked,
  upgradeCastle,
  upgradeCost,
  upgradeLacks,
  incomeOf,
  PAY_EVERY,
  visionOf,
  type Castle,
  type Match,
  type Owner,
  type Tower,
  type Unit,
} from './sim';

/** A small seeded random source (mulberry32): same seed, same sequence. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Where the sequence is, to carry on from there elsewhere (a page that joins a match in progress). */
  next.state = () => a;
  next.restore = (state: number) => void (a = state >>> 0);
  return next;
}

/** What "covering the road" is counted over, for one seat: points half a cell apart along each way its units walk, and a cache of what each cell sees (a board never changes). */
interface RoadView {
  samples: [number, number, number][];
  /** How much road a tower of some range would cover from a cell, and how far along its seat's lanes (cells from its castle). */
  coverage: Map<string, { n: number; at: number }>;
}
const roadViews = new WeakMap<Board, Map<number, RoadView>>();
function roadView(b: Board, seat: number): RoadView {
  let seats = roadViews.get(b);
  if (!seats) roadViews.set(b, (seats = new Map<number, RoadView>()));
  let v = seats.get(seat);
  if (!v) {
    const samples: RoadView['samples'] = [];
    for (const lane of b.lanes)
      if (lane.from === seat)
        for (let i = 0; i < Math.floor(lane.length * 2); i++) {
          const [x, y] = lane.pointAt(i / 2);
          samples.push([x, y, i / 2]);
        }
    v = { samples, coverage: new Map() };
    seats.set(seat, v);
  }
  return v;
}

function coverageOf(b: Board, seat: number, col: number, row: number, range: number): { n: number; at: number } {
  const view = roadView(b, seat);
  const key = `${b.cellIndex(col, row)}:${range}`;
  let c = view.coverage.get(key);
  if (!c) {
    let [n, sum] = [0, 0];
    for (const [x, y, at] of view.samples) {
      if (hypot(x - col - 0.5, y - row - 0.5) > range) continue;
      n++;
      sum += at;
    }
    c = { n, at: n ? sum / n : 0 };
    view.coverage.set(key, c);
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
/** Seconds of income an upgrade may be away for the AI to start saving for it. */
const SAVE_WITHIN = 240;
/** What a loaded soldier is assumed to reach from a bunker, for choosing where one goes. */
const BUNKER_REACH = 5.5 * REACH_SCALE;

/** How much a cell is worth for each cell it lies nearer the enemy castle along the road: pushes the front line forward. */
const PUSH = 0.5;
/** Road samples (half a cell each) beyond which more coverage adds nothing: any cell beside the road sees enough of it. */
const ENOUGH = 10 * REACH_SCALE;

/** How good a cell is for this building: enough road covered by what it shoots or sees, then as far forward as it can go; friends an aura would reach. */
function score(m: Match, owner: Owner, def: TowerDef, col: number, row: number): number {
  const role = roleOf(def);
  const centre = m.board.castles[owner]!;
  // Money, unlocks and upgrades sit safe and close: the nearest free cells to the castle.
  if (role === 'econ' || role === 'prod' || role === 'smith')
    return -hypot(centre[0] - col - 0.5, centre[1] - row - 0.5);
  if (role === 'aura') {
    const foe = nearestFoeCastle(m, owner);
    const friends = m.towers.filter(
      (t) => t.owner === owner && hypot(t.col - col, t.row - row) <= (def.aura?.radius ?? 0),
    ).length;
    return friends * 12 - hypot(foe[0] - col - 0.5, foe[1] - row - 0.5) * 0.15;
  }
  const range = role === 'detect' ? (def.detect ?? 0) : role === 'bunker' ? BUNKER_REACH : def.range;
  const c = coverageOf(m.board, owner, col, row, range);
  if (c.n === 0) return -Infinity; // it would see no road at all
  return Math.min(c.n, ENOUGH) + c.at * PUSH;
}

/** The castle of a foe nearest `owner`'s own (where its front line is pushed to). */
function nearestFoeCastle(m: Match, owner: Owner): readonly [number, number] {
  const mine = m.board.castles[owner]!;
  let best = m.board.castles[foesOf(m, owner)[0] ?? owner]!;
  for (const o of foesOf(m, owner)) {
    const c = m.board.castles[o]!;
    if (hypot(c[0] - mine[0], c[1] - mine[1]) < hypot(best[0] - mine[0], best[1] - mine[1])) best = c;
  }
  return best;
}

/** The cell `owner` may build this tower on that serves it best, if any is free. */
export function bestCell(m: Match, owner: Owner, def: TowerDef): [number, number] | undefined {
  let best: [number, number] | undefined;
  let bestScore = -Infinity;
  // Ties go to the first cell met, and each side scans from its own castle outward in the same way, so neither is favoured.
  const { rows, cols, roadCells, cellIndex } = m.board;
  const fromTop = m.board.castles[owner]![1] < rows / 2;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const [row, col] = fromTop ? [r, k] : [rows - 1 - r, cols - 1 - k];
      if (roadCells.has(cellIndex(col, row)) || canBuild(m, owner, def, col, row) !== 'ok') continue;
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

/** The other side's units the AI can see (what its side sees, allies included). */
export const foeUnits = (m: Match, owner: Owner): Unit[] => {
  const vision = visionOf(m);
  const foes = foesOf(m, owner);
  return m.units.filter((u) => foes.includes(u.owner) && isSeen(m, owner, u, vision));
};
/** The other side's towers the AI can see. */
export const foeTowers = (m: Match, owner: Owner): Tower[] => {
  const vision = visionOf(m);
  const foes = foesOf(m, owner);
  return m.towers.filter((t) => foes.includes(t.owner) && isSeen(m, owner, t, vision));
};
/** The castle of the foe it is sending its army to (its lane's end), or nothing while that is out of sight (so a rush is never planned on a castle it cannot see). */
export const foeCastle = (m: Match, owner: Owner): Castle | undefined => {
  const target = m.board.lanes[m.players[owner]!.lane]?.to;
  const seats = target !== undefined && foesOf(m, owner).includes(target) ? [target] : foesOf(m, owner);
  const seen = seats.filter((o) => isCastleSeen(m, owner, o));
  return seen.length ? m.players[seen[0]!]!.castle : undefined;
};

const ownUnits = (m: Match, owner: Owner) => m.units.filter((u) => u.owner === owner);
const ownTowers = (m: Match, owner: Owner) => m.towers.filter((t) => t.owner === owner);
const dps = (u: UnitDef) => (u.damage * (u.multi ?? 1)) / u.cooldown;
/** Cells (along its way) between an enemy unit and this side's castle (a unit on its way to another castle is no threat to this one). */
const fromCastle = (m: Match, owner: Owner, u: Unit) => {
  const lane = laneOf(m.board, u);
  return lane.to === owner ? lane.length - u.s : Infinity;
};
const total = (c: Cost) => c.wood + c.stone;

/** Which defensive building does `owner` need most right now? It answers what the other side has sent or can send: air, cloaked units. */
function chooseTower(
  m: Match,
  owner: Owner,
  options: TowerDef[],
  random: () => number,
  bias?: Record<string, number>,
): TowerDef | undefined {
  if (!options.length) return undefined;
  const mine = ownTowers(m, owner);
  const race = raceOf(m, owner);
  const foeRaces = foesOf(m, owner).map((o) => raceOf(m, o));
  const sees = (hits: (t: TowerDef) => boolean) => mine.filter((t) => hits(t.def)).length;
  const air = foeUnits(m, owner).some((u) => u.def.air);
  const canAir = foeRaces.some((r) => r.units.some((u) => u.air));
  const antiAir = sees(isAntiAir);
  const cloaked = foeUnits(m, owner).some((u) => u.def.cloak) || foeRaces.some((r) => r.units.some((u) => u.cloak));
  const detectors = sees((d) => !!d.detect);
  const bunkers = mine.filter((t) => t.def.bunker);
  const loadable = race.units.some((u) => u.garrison && u.range > 1.5 && unitUnlocked(m, owner, u) === 'ok');
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
  return pickWeighted(
    options,
    options.map((d) => weight(d) * (bias?.[d.id] ?? 1)),
    random,
  );
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
function chooseUnit(
  m: Match,
  owner: Owner,
  options: UnitDef[],
  random: () => number,
  bias?: Record<string, number>,
): UnitDef | undefined {
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
  if (bias) weights.forEach((w, i) => (weights[i] = w * (bias[options[i]!.id] ?? 1)));
  return pickWeighted(options, weights, random);
}

/** The units of one wave, as many as the money and the cap allow: what it would like, or failing the money for that, the best it can pay for. */
function pickWave(
  m: Match,
  owner: Owner,
  options: UnitDef[],
  random: () => number,
  bias?: Record<string, number>,
): UnitDef[] {
  const wave: UnitDef[] = [];
  const left = { wood: m.players[owner]!.wood, stone: m.players[owner]!.stone };
  let room = UNIT_CAP - ownUnits(m, owner).length;
  while (wave.length < WAVE_MAX) {
    const ok = options.filter((u) => canAfford(left, u.cost) && u.count <= room);
    const want = chooseUnit(m, owner, options, random, bias);
    const pick = want && ok.includes(want) ? want : chooseUnit(m, owner, ok, random, bias);
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
  const [foe, foeRaces] = [foeUnits(m, owner), foesOf(m, owner).map((o) => raceOf(m, o))];
  const cheapest = (ok: (d: TowerDef) => boolean) =>
    defs.filter(ok).sort((a, b) => a.tier - b.tier || total(a.cost) - total(b.cost))[0];
  const cloaked = foe.filter((u) => u.def.cloak).length;
  const detectors = mine.filter((t) => t.def.detect).length;
  if (
    (cloaked > 0 || (foeRaces.some((r) => r.units.some((u) => u.cloak)) && m.time > DETECTOR_BY)) &&
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
  /** Multiplies how much the AI wants a unit (by unit id) when it picks a wave: a race's own plan (all air, no thieves). Default 1. */
  unitWeight?: Record<string, number>;
  /** The same for towers, by tower id. */
  towerWeight?: Record<string, number>;
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
    rush: between(420, 780),
  };
}

/**
 * Named plans for balance runs (`tools/towercraftLab.ts`): each fixes a `Style` instead of drawing one, so a race can be tested
 * against a rush, a turtle, and so on. They stay inside the ranges `styleFor` draws from. The game itself never uses them.
 */
export const STRATEGIES: Record<string, Style> = {
  /** Small quick waves, late upgrades, few towers, walks past everything from the third minute: a win takes 3 to 5 minutes. */
  rush: {
    waveEvery: 20,
    upgradeAfter: [90, 330],
    towerStart: 1,
    towerEvery: 120,
    ecoEvery: 70,
    techStart: 1,
    techEvery: 90,
    siege: 40,
    rush: 150,
  },
  /** Towers early and often, a big late wave, castle up early. */
  turtle: {
    waveEvery: 50,
    upgradeAfter: [30, 110],
    towerStart: 3,
    towerEvery: 50,
    ecoEvery: 40,
    techStart: 1,
    techEvery: 70,
    siege: 15,
    rush: 780,
  },
  /** Teching: the castle up as soon as it can be, few towers, waves of the best units. */
  boom: {
    waveEvery: 40,
    upgradeAfter: [30, 110],
    towerStart: 1,
    towerEvery: 110,
    ecoEvery: 30,
    techStart: 2,
    techEvery: 45,
    siege: 25,
    rush: 600,
  },
  /** Towers over units, the middle of everything else. */
  fort: {
    waveEvery: 45,
    upgradeAfter: [60, 200],
    towerStart: 3,
    towerEvery: 55,
    ecoEvery: 50,
    techStart: 1,
    techEvery: 80,
    siege: 15,
    rush: 720,
  },
  /** The middle of every range. */
  balanced: {
    waveEvery: 35,
    upgradeAfter: [60, 220],
    towerStart: 2,
    towerEvery: 85,
    ecoEvery: 50,
    techStart: 1,
    techEvery: 65,
    siege: 28,
    rush: 600,
  },
};

/** What an AI carries from one thought to the next, so a page that joins a match in progress can carry on exactly where the other is. */
export interface AiState {
  timer: number;
  lastWave: number;
  bought: number;
  waves: number;
  rng: number;
}

/** The AI for a seat: call it every step with the match and the step's length (`save`/`load` move its memory between pages). */
export interface Ai {
  (m: Match, dt: number): void;
  save(): AiState;
  load(state: AiState): void;
}

/** The AI for player `owner`: call the returned function every step with the match and the step's length. `plan` replaces parts of the seed's style. */
export function createAi(owner: Owner, seed: number, plan?: Partial<Style>): Ai {
  // Neighbouring seeds (the two sides of a match) must not give neighbouring styles: scramble the seed first.
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const random = seeded((h ^ (h >>> 16)) >>> 0);
  const style: Style = { ...styleFor(random), ...plan };
  let timer = 0;
  let lastWave = 0;
  let bought = 0;
  /** Waves sent so far: each goes down the next road that forks off its castle. */
  let waves = 0;
  const think = (m: Match, dt: number) => {
    if (m.winner >= 0 || m.players[owner]!.out) return;
    timer += dt;
    if (timer < THINK_EVERY) return;
    timer -= THINK_EVERY;
    const me = m.players[owner]!;
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

    const threat = Math.min(Infinity, ...foeUnits(m, owner).map((u) => fromCastle(m, owner, u)));
    const alarm = threat < ALARM;

    // What the foe fields decides one tower the AI must have (and so maybe a castle level to build it).
    const answer = answerTower(m, owner, race.towers);
    const upReady = upgradeLacks(m, owner).length === 0; // the buildings the upgrade asks for stand
    const mustUp = upReady && answer !== undefined && answer.tier > level;

    // Up a level once the time is right and a tower or two stand; save for it (but not while the foe is at the gate).
    const cost = upgradeCost(m, owner);
    const wantUp =
      level < MAX_LEVEL &&
      upReady &&
      cost !== undefined &&
      (mustUp || (m.time >= style.upgradeAfter[level - 1]! && towers.length >= 1));
    if (wantUp && canAfford(me, cost)) {
      upgradeCastle(m, owner);
      return;
    }
    // Save for it only once it is about two minutes of income away: before that the money goes on units, so a dear upgrade neither
    // empties the army for ten minutes nor is put off for ever.
    const pay = incomeOf(m, owner);
    const away =
      cost &&
      Math.max((cost.wood - me.wood) / (pay.wood / PAY_EVERY), (cost.stone - me.stone) / (pay.stone / PAY_EVERY));
    const saving = wantUp && !alarm && away !== undefined && away <= SAVE_WITHIN;

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
          style.towerWeight,
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
        .filter((u) => u.garrison && u.range > 1.5 && unitUnlocked(m, owner, u) === 'ok')
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
    const wave = pickWave(m, owner, options, random, style.unitWeight);
    // Never a trickle: unless the foe is at the gate, wait until the money (of both kinds) buys a few units at least.
    if (!alarm && wave.reduce((n, u) => n + u.count, 0) < Math.min(MAX_MIN_WAVE, MIN_WAVE + m.time / WAVE_GROWS))
      return;
    // Where the roads fork, each wave takes the next of them (the foes' castles in turn, or another road to the same one).
    const lanes = openLanes(m, owner);
    if (lanes.length > 1) setLane(m, owner, lanes[(waves + owner) % lanes.length]!.id);
    for (const def of wave) trainUnit(m, owner, def.id);
    if (wave.length) {
      lastWave = m.time;
      bought += wave.length;
      waves++;
    }
  };
  const ai: Ai = Object.assign(think, {
    save: (): AiState => ({ timer, lastWave, bought, waves, rng: random.state() }),
    load: (state: AiState) => {
      ({ timer, lastWave, bought, waves } = state);
      random.restore(state.rng);
    },
  });
  return ai;
}
