// The computer opponent (Pixi-free). It thinks twice a second, with a seeded random source so a match replays. Its plan:
//  - MASS, then send: gold is saved until a wave is affordable, then the whole wave is bought at once, so it queues together and
//    walks out together (the queue is the only holding there is: a castle sends units on as soon as they are trained). A wave
//    is also bought early when the foe is at the gate or the AI has waited too long, so gold is never hoarded.
//  - UPGRADE the castle on a schedule (a minimum time per level, and a tower or two first), saving for it rather than spending.
//  - TOWERS: a goal count that grows with the castle's level, an attacker where it covers the most road, pushed toward the foe
//    tower by tower (towers with `reach` extend the build area), a detector against cloaked units, an anti-air tower against air,
//    one aura of each kind among its towers; none that the foe cannot be hurt by (no air about: no air-only tower).
//  - ORDERS: normally units fight towers and units; with an army that could take the castle down in a few seconds they walk past the
//    towers (`bypass`) and finish it.
// Everything it knows about the other side is read through `foeUnits`, `foeTowers` and `foeCastle` below (the one place to put sight).

import { CASTLES, COLS, ROAD_CELLS, ROAD_LENGTH, ROWS, cellIndex, pointAt } from './board';
import { MAX_LEVEL, type TowerDef, type UnitDef } from './races';
import {
  AIR_LENGTH,
  QUEUE_MAX,
  buildTower,
  canBuild,
  enemy,
  raceOf,
  setOrder,
  trainUnit,
  upgradeCastle,
  upgradeCost,
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

/** What a tower is for: an attacker, a detector or a helper (aura), for deciding where it goes and when it is needed. */
export const roleOf = (def: TowerDef): 'attack' | 'detect' | 'aura' =>
  def.damage > 0 ? 'attack' : def.detect ? 'detect' : 'aura';

/** How much a cell is worth for each cell it lies nearer the enemy castle along the road: pushes the front line forward. */
const PUSH = 0.5;
/** Road samples (half a cell each) beyond which more coverage adds nothing: any cell beside the road sees enough of it. */
const ENOUGH = 10;

/** How good a cell is for this tower: enough road covered by what it shoots or sees, then as far forward as it can go; friends an aura would reach. */
function score(m: Match, owner: Owner, def: TowerDef, col: number, row: number): number {
  const role = roleOf(def);
  if (role === 'aura') {
    const foe = CASTLES[enemy(owner)];
    const friends = m.towers.filter(
      (t) => t.owner === owner && Math.hypot(t.col - col, t.row - row) <= (def.aura?.radius ?? 0),
    ).length;
    return friends * 12 - Math.hypot(foe[0] - col - 0.5, foe[1] - row - 0.5) * 0.15;
  }
  const c = coverageOf(col, row, role === 'attack' ? def.range : (def.detect ?? 0));
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

// --- What the AI knows of the other side (the one place to put sight: read the foe only through these) -----------------------------

/** The other side's units the AI can know about. */
export const foeUnits = (m: Match, owner: Owner): Unit[] => m.units.filter((u) => u.owner === enemy(owner));
/** The other side's towers the AI can know about. */
export const foeTowers = (m: Match, owner: Owner): Tower[] => m.towers.filter((t) => t.owner === enemy(owner));
/** The other side's castle. */
export const foeCastle = (m: Match, owner: Owner): Castle => m.players[enemy(owner)].castle;

const ownUnits = (m: Match, owner: Owner) => m.units.filter((u) => u.owner === owner);
const ownTowers = (m: Match, owner: Owner) => m.towers.filter((t) => t.owner === owner);
const dps = (u: UnitDef) => u.damage / u.cooldown;
/** Cells (along its way) between an enemy unit and this side's castle. */
const fromCastle = (u: Unit) => (u.def.air ? AIR_LENGTH : ROAD_LENGTH) - u.s;

/** Which tower does `owner` need most right now? It answers what the other side has sent or can send: air, cloaked units. */
function chooseTower(m: Match, owner: Owner, options: TowerDef[], random: () => number): TowerDef | undefined {
  if (!options.length) return undefined;
  const mine = ownTowers(m, owner);
  const foeRace = raceOf(m, enemy(owner));
  const sees = (hits: (t: TowerDef) => boolean) => mine.filter((t) => hits(t.def)).length;
  const air = foeUnits(m, owner).some((u) => u.def.air);
  const canAir = foeRace.units.some((u) => u.air);
  const antiAir = sees((d) => d.damage > 0 && d.hits !== 'ground');
  const cloaked = foeUnits(m, owner).some((u) => u.def.cloak) || foeRace.units.some((u) => u.cloak);
  const detectors = sees((d) => !!d.detect);
  const weight = (def: TowerDef) => {
    const role = roleOf(def);
    if (def.detect) return cloaked && detectors < 1 ? 5 : detectors < 1 ? 0.3 : 0.05; // once, early enough that they are not free
    if (role === 'aura')
      return mine.length >= 3 && sees((d) => d.aura?.kind === def.aura?.kind) < 1 ? AURA_WEIGHT : 0.05; // once there are towers to help
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

/** Which unit to train: leaning to air where the other side has nothing up, cloaked where it has no detector, archers against air. */
function chooseUnit(m: Match, owner: Owner, options: UnitDef[], random: () => number): UnitDef | undefined {
  if (!options.length) return undefined;
  const towers = foeTowers(m, owner);
  const noAntiAir = !towers.some((t) => t.def.damage > 0 && t.def.hits !== 'ground');
  const noDetector = !towers.some((t) => t.def.detect);
  const foeAir = foeUnits(m, owner).filter((u) => u.def.air).length;
  const myShooters = ownUnits(m, owner).filter((u) => u.def.hitsAir).length;
  const weights = options.map(
    (u) =>
      1 +
      u.tier * 0.5 +
      (u.air && noAntiAir ? 3 : 0) +
      (u.cloak && noDetector ? 2 : 0) +
      (u.air && !noAntiAir ? -2 : 0) +
      (u.hitsAir && foeAir > myShooters ? 3 : 0),
  );
  return pickWeighted(options, weights, random);
}

/** The units of one wave, as many as the queue and the gold allow, slowest to arrive first so that the wave reaches the foe together. */
function pickWave(m: Match, owner: Owner, options: UnitDef[], random: () => number): UnitDef[] {
  const wave: UnitDef[] = [];
  let gold = m.players[owner].gold;
  while (wave.length < QUEUE_MAX - m.players[owner].queue.length) {
    // What it would like, or failing the gold for that, the best it can pay for: the gold is spent, not kept for the next wave.
    const want = chooseUnit(m, owner, options, random);
    const pick =
      want && want.cost <= gold
        ? want
        : chooseUnit(
            m,
            owner,
            options.filter((u) => u.cost <= gold),
            random,
          );
    if (!pick) break;
    gold -= pick.cost;
    wave.push(pick);
  }
  const trip = (u: UnitDef) => (u.air ? AIR_LENGTH : ROAD_LENGTH) / u.speed;
  return wave.sort((a, b) => trip(b) - trip(a));
}

/** The tower this side must have now to answer what the foe fields (or surely will): a detector for cloaked units, a shooter for air. */
function answerTower(m: Match, owner: Owner, defs: TowerDef[]): TowerDef | undefined {
  const mine = ownTowers(m, owner);
  const [foe, foeRace] = [foeUnits(m, owner), raceOf(m, enemy(owner))];
  const cheapest = (ok: (d: TowerDef) => boolean) =>
    defs.filter(ok).sort((a, b) => a.tier - b.tier || a.cost - b.cost)[0];
  const cloaked = foe.filter((u) => u.def.cloak).length;
  const detectors = mine.filter((t) => t.def.detect).length;
  if (
    (cloaked > 0 || (foeRace.units.some((u) => u.cloak) && m.time > DETECTOR_BY)) &&
    detectors < (cloaked >= 8 ? 2 : 1)
  )
    return cheapest((d) => !!d.detect);
  const air = foe.filter((u) => u.def.air).length;
  const shooters = mine.filter((t) => t.def.damage > 0 && t.def.hits !== 'ground').length;
  if (air > 0 && shooters < 1 + Math.floor(air / 3)) return cheapest((d) => d.damage > 0 && d.hits !== 'ground');
  return undefined;
}

// --- Plan -----------------------------------------------------------------------------------------------------------------------------

const THINK_EVERY = 0.5;
/** Seconds into the match by which a side whose foe can field cloaked units has a detector standing. */
const DETECTOR_BY = 90;
/** The most towers the AI keeps. */
const MAX_TOWERS = 10;
/** A foe closer than this many cells to the castle is an emergency: units are bought at once. */
const ALARM = 24;
/** The army walks past the foe's units only when it would kill their castle in under this share of the time theirs would kill ours. */
const RACE_MARGIN = 0.6;

/**
 * How one game of the AI is played, drawn from its seed. Two equal armies cancel out on the road, so a match between sides
 * that played alike would never end; sides that play differently (a quick small wave, or a big late one; towers or none) win,
 * lose and leak units to the castle, and each style beats some of the others. Every side draws from the same ranges, so no
 * race or side is favoured by it.
 */
export interface Style {
  /** Seconds between waves: all the gold there is then goes on one wave, so it queues and marches together. */
  waveEvery: number;
  /** Earliest time (seconds) the castle is raised to level 2 and to level 3. */
  upgradeAfter: [number, number];
  /** Towers wanted at the start of the match. */
  towerStart: number;
  /** Then one more tower for every this many seconds. */
  towerEvery: number;
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

    // Orders: fight everything, unless the army could take the castle down fast, then walk past the towers (and, when the foe's
    // army could not do the same to ours first, past its units too: a race to the castles) and do it. The patience for it
    // shrinks as the match drags on, so a stalemate does not last.
    const myDps = mine.reduce((a, u) => a + dps(u.def), 0);
    const foeDps = foeUnits(m, owner).reduce((a, u) => a + dps(u.def), 0);
    const killIn = foeCastle(m, owner).hp / Math.max(1, myDps);
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
    if (wantUp && me.gold >= cost) {
      upgradeCastle(m, owner);
      return;
    }
    const saving = wantUp && !alarm;

    // The answering tower first (saving for it if need be), then towers up to the goal for the time.
    if (answer && !mustUp) {
      const cell = me.gold >= answer.cost ? bestCell(m, owner, answer) : undefined;
      if (cell) {
        buildTower(m, owner, answer.id, cell[0], cell[1]);
        return;
      }
      if (!alarm && !cell && me.gold < answer.cost) return;
    }
    if (
      towers.length < Math.min(MAX_TOWERS, style.towerStart + m.time / style.towerEvery) &&
      !(saving && towers.length >= 1)
    ) {
      const def = chooseTower(
        m,
        owner,
        race.towers.filter((t) => t.tier <= level && t.cost <= me.gold),
        random,
      );
      const cell = def && bestCell(m, owner, def);
      if (def && cell) {
        buildTower(m, owner, def.id, cell[0], cell[1]);
        return;
      }
    }

    // Units, in waves: save up, then buy the whole wave at once so it marches together.
    if (saving) return;
    const options = race.units.filter((u) => u.tier <= level);
    const cheapest = Math.min(...options.map((u) => u.cost));
    // A wave also goes at once when the gold would fill the whole queue: a rich side does not sit on its money.
    const rich = me.gold >= (QUEUE_MAX * options.reduce((a, u) => a + u.cost, 0)) / options.length;
    const ready = me.queue.length <= 1 && me.gold >= cheapest * 2 && (rich || m.time - lastWave >= style.waveEvery);
    if (!ready && !alarm) return;
    const wave = pickWave(m, owner, options, random);
    for (const def of wave) trainUnit(m, owner, def.id);
    const bought = wave.length;
    if (bought) lastWave = m.time;
  };
}
