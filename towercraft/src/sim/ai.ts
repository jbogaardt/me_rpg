// The computer opponent (Pixi-free). It thinks about once a second, with a seeded random source so a match replays: it
// raises its castle as gold and time allow, keeps a few towers (an attacker where it covers the most road, a detector near the
// road, an aura among its towers), answers what the other side fields (air, cloaked units) and trains units with the rest.
// It is a sparring partner for the prototype, not a clever player.

import { CASTLES, COLS, ROAD_CELLS, ROAD_LENGTH, ROWS, cellIndex, pointAt } from './board';
import { MAX_LEVEL, type TowerDef, type UnitDef } from './races';
import {
  buildTower,
  canBuild,
  enemy,
  isCastleSeen,
  isSeen,
  raceOf,
  setOrder,
  trainUnit,
  upgradeCastle,
  upgradeCost,
  type Match,
  type Owner,
  visionOf,
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

/** How much road a tower of this range would cover from each cell (cached: the road never changes). */
const coverage = new Map<string, number>();
function coverageOf(col: number, row: number, range: number): number {
  const key = `${cellIndex(col, row)}:${range}`;
  let n = coverage.get(key);
  if (n === undefined) {
    n = 0;
    for (const [x, y] of ROAD_SAMPLES) if (Math.hypot(x - col - 0.5, y - row - 0.5) <= range) n++;
    coverage.set(key, n);
  }
  return n;
}

/** What a tower is for: an attacker, a detector or a helper (aura), for deciding where it goes and when it is needed. */
export const roleOf = (def: TowerDef): 'attack' | 'detect' | 'aura' =>
  def.damage > 0 ? 'attack' : def.detect ? 'detect' : 'aura';

/** How good a cell is for this tower: road covered by what it shoots or sees, friends an aura would reach; nearer the enemy is a little better. */
function score(m: Match, owner: Owner, def: TowerDef, col: number, row: number): number {
  const foe = CASTLES[enemy(owner)];
  const toFoe = Math.hypot(foe[0] - col - 0.5, foe[1] - row - 0.5);
  const friends = () =>
    m.towers.filter((t) => t.owner === owner && Math.hypot(t.col - col, t.row - row) <= (def.aura?.radius ?? 0)).length;
  const base =
    roleOf(def) === 'attack'
      ? coverageOf(col, row, def.range)
      : roleOf(def) === 'detect'
        ? coverageOf(col, row, def.detect ?? 0)
        : friends() * 12;
  return base - toFoe * 0.15;
}

/** The cell `owner` may build this tower on that serves it best, if any is free. */
export function bestCell(m: Match, owner: Owner, def: TowerDef): [number, number] | undefined {
  let best: [number, number] | undefined;
  let bestScore = -Infinity;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
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

/** Which tower does `owner` need most right now? It answers what the other side has sent or can send: air, cloaked units. */
function chooseTower(m: Match, owner: Owner, options: TowerDef[], random: () => number): TowerDef | undefined {
  if (!options.length) return undefined;
  const mine = m.towers.filter((t) => t.owner === owner);
  const foe = enemy(owner);
  const foeRace = raceOf(m, foe);
  const vision = visionOf(m); // it only reacts to what it can see
  const sees = (hits: (t: TowerDef) => boolean) => mine.filter((t) => hits(t.def)).length;
  const weight = (def: TowerDef) => {
    let w = 1;
    const role = roleOf(def);
    // Air about (or the other race can build it): want something that shoots up, and more as it grows.
    const air = m.units.some((u) => u.owner === foe && u.def.air && isSeen(m, owner, u, vision));
    const canAir = foeRace.units.some((u) => u.air);
    const antiAir = sees((d) => d.damage > 0 && d.hits !== 'ground');
    if (role === 'attack' && def.hits !== 'ground') w += air ? 4 / (1 + antiAir) : canAir && antiAir < 1 ? 1.5 : 0;
    if (role === 'attack' && def.hits === 'air') w = air || (canAir && antiAir < 1) ? w : 0.15; // an air-only tower is wasted with no air about
    // Cloaked units: a detector, once, early enough that they are not free.
    const cloaked =
      m.units.some((u) => u.owner === foe && u.def.cloak && isSeen(m, owner, u, vision)) ||
      foeRace.units.some((u) => u.cloak);
    const detectors = sees((d) => !!d.detect);
    if (def.detect) w = cloaked && detectors < 1 ? 5 : detectors < 1 ? 0.6 : 0.1;
    // Auras once there are towers to strengthen.
    if (role === 'aura') w = mine.length >= 4 && sees((d) => d.aura?.kind === def.aura?.kind) < 1 ? 2.5 : 0.1;
    if (role === 'attack' && (def.splash > 0 || def.dot)) w += 0.5;
    return w;
  };
  const weights = options.map(weight);
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return options[i];
  }
  return options[options.length - 1];
}

/** Which unit to train: the best it can pay for, leaning to air where the other side has nothing up, cloaked where it has no detector. */
function chooseUnit(m: Match, owner: Owner, options: UnitDef[], random: () => number): UnitDef | undefined {
  if (!options.length) return undefined;
  const vision = visionOf(m);
  const foeTowers = m.towers.filter((t) => t.owner === enemy(owner) && isSeen(m, owner, t, vision));
  const noAntiAir = !foeTowers.some((t) => t.def.damage > 0 && t.def.hits !== 'ground');
  const noDetector = !foeTowers.some((t) => t.def.detect);
  const weights = options.map(
    (u) => 1 + u.tier + (u.air && noAntiAir ? 3 : 0) + (u.cloak && noDetector ? 2 : 0) + (u.air && !noAntiAir ? -2 : 0),
  );
  let roll = random() * weights.reduce((a, b) => a + Math.max(0.2, b), 0);
  for (let i = 0; i < options.length; i++) {
    roll -= Math.max(0.2, weights[i]!);
    if (roll <= 0) return options[i];
  }
  return options[options.length - 1];
}

const THINK_EVERY = 1;

/** The AI for player `owner`: call the returned function every step with the match and the step's length. */
export function createAi(owner: Owner, seed: number): (m: Match, dt: number) => void {
  const random = seeded(seed);
  let timer = 0;
  return (m, dt) => {
    if (m.winner >= 0) return;
    timer += dt;
    if (timer < THINK_EVERY) return;
    timer -= THINK_EVERY;
    const me = m.players[owner];
    const race = raceOf(m, owner);
    const level = me.castle.level;

    // Orders: normally fight everything, but with a good army and the other castle hurt, run past the towers and finish it.
    const army = m.units.filter((u) => u.owner === owner).length;
    const foeCastle = m.players[enemy(owner)].castle;
    setOrder(
      m,
      owner,
      'towers',
      army >= 4 && isCastleSeen(m, owner, enemy(owner)) && foeCastle.hp < foeCastle.maxHp * 0.6 ? 'bypass' : 'attack',
    );

    // Up a level once the time is right and it can pay, and not at the cost of having no defence at all.
    const cost = upgradeCost(m, owner);
    const towers = m.towers.filter((t) => t.owner === owner).length;
    if (level < MAX_LEVEL && cost !== undefined && me.gold >= cost && m.time > 50 * level && towers >= level + 1) {
      upgradeCastle(m, owner);
      return;
    }

    if (towers < 2 + level * 2 && random() < 0.45) {
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
    if (me.queue.length >= 3) return;
    const pick = chooseUnit(
      m,
      owner,
      race.units.filter((u) => u.tier <= level && u.cost <= me.gold),
      random,
    );
    if (pick) trainUnit(m, owner, pick.id);
  };
}
