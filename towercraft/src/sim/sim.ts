// The rules of a match (Pixi-free, deterministic: the same commands at the same times give the same game, so it is unit-tested
// without a browser and can later run on a server). Two castles at the ends of one road. A castle trains units, which march
// toward the enemy castle and fight whatever is in reach on the way: units hit units, towers and the castle. Towers hit units
// only, each its own kind (ground, air or both; area damage; poison), and some towers only help: an aura that strengthens or heals
// friends, a detector that reveals cloaked units. Air units fly the straight line between castles; cloaked units are unseen
// (untargetable) unless a detector of the other side is near. Towers go within the castle's build reach (grown by upgrading it) or the reach of a tower already built, so a front
// line is pushed forward tower by tower. The first castle destroyed loses.

import { CASTLES, CASTLE_CLEAR, ROAD_CELLS, ROAD_LENGTH, cellIndex, inBoard, pointAt } from './board';
import { MAX_LEVEL, RACES, type RaceId, type TowerDef, type UnitDef } from './races';

export const START_GOLD = 150;
export const PAY_EVERY = 5;
export const BASE_PAY = 8;
/** A match that goes on this long (seconds) is decided on castle hit points left. */
export const TIME_LIMIT = 1200;
export const QUEUE_MAX = 6;
/** How far (cells) a castle's body reaches: attackers hit its edge, not its centre. */
export const CASTLE_RADIUS = 1.2;
const TOWER_RADIUS = 0.5;

export type Owner = 0 | 1;

export interface Unit {
  id: number;
  def: UnitDef;
  owner: Owner;
  hp: number;
  /** Cells walked from its own castle toward the other (along the road, or the straight line for an air unit). */
  s: number;
  cooldown: number;
  /** Poison on it: hit points lost a second, for `left` more seconds. */
  dot?: { dps: number; left: number };
}

export interface Tower {
  id: number;
  def: TowerDef;
  owner: Owner;
  col: number;
  row: number;
  hp: number;
  cooldown: number;
}

export interface Castle {
  hp: number;
  maxHp: number;
  level: number;
  cooldown: number;
}

export interface Training {
  def: UnitDef;
  left: number;
}

export interface Player {
  race: RaceId;
  gold: number;
  castle: Castle;
  queue: Training[];
}

/** An attack made this step, for the renderer: from a point to a point, in cells; `melee` is a blow, not a missile. */
export interface Shot {
  from: [number, number];
  to: [number, number];
  melee: boolean;
  splash: number;
}

/** A unit killed this step, where it fell, for the renderer to play its death. */
export interface Death {
  at: [number, number];
  /** Which way it was walking (0 = down the road from the start, 1 = back up it). */
  owner: Owner;
  def: UnitDef;
  s: number;
}

export interface Match {
  time: number;
  payTimer: number;
  players: [Player, Player];
  units: Unit[];
  towers: Tower[];
  shots: Shot[];
  deaths: Death[];
  /** Towers destroyed this step. */
  razed: { col: number; row: number }[];
  nextId: number;
  /** -1 still playing, 0 or 1 the winner, 2 a draw. */
  winner: -1 | 0 | 1 | 2;
}

export function newMatch(races: [RaceId, RaceId]): Match {
  const player = (race: RaceId): Player => {
    const hp = RACES[race].castle.hp;
    return { race, gold: START_GOLD, castle: { hp, maxHp: hp, level: 1, cooldown: 0 }, queue: [] };
  };
  return {
    time: 0,
    payTimer: 0,
    players: [player(races[0]), player(races[1])],
    units: [],
    towers: [],
    shots: [],
    deaths: [],
    razed: [],
    nextId: 1,
    winner: -1,
  };
}

export const enemy = (o: Owner): Owner => (o === 0 ? 1 : 0);
export const raceOf = (m: Match, o: Owner) => RACES[m.players[o].race];

/** How far (cells) an air unit flies between the castles: the straight line. */
export const AIR_LENGTH = Math.hypot(CASTLES[1][0] - CASTLES[0][0], CASTLES[1][1] - CASTLES[0][1]);

/** How far a unit can walk or fly toward the enemy castle before it is at the castle's edge. */
const goalOf = (def: Pick<UnitDef, 'air'>) => (def.air ? AIR_LENGTH : ROAD_LENGTH) - CASTLE_RADIUS;

/** Where a unit is, in cells: along the road from its own castle, or on the straight line for an air unit. */
export function unitPos(u: Pick<Unit, 'owner' | 's' | 'def'>): [number, number] {
  if (u.def.air) {
    const [from, to] = [CASTLES[u.owner], CASTLES[enemy(u.owner)]];
    const t = Math.min(1, Math.max(0, u.s / AIR_LENGTH));
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  }
  return pointAt(u.owner === 0 ? u.s : ROAD_LENGTH - u.s);
}

const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centreOf = (t: { col: number; row: number }): [number, number] => [t.col + 0.5, t.row + 0.5];

export type Result = 'ok' | 'over' | 'gold' | 'unknown' | 'tier' | 'queue' | 'max';

// --- Sight and auras -------------------------------------------------------------------------------------------------

/** Can `viewer` see this unit? A cloaked one only within a detector (tower, or the castle's own sight) of the viewer's. */
export function visibleTo(m: Match, u: Unit, viewer: Owner): boolean {
  if (!u.def.cloak || u.owner === viewer) return true;
  const at = unitPos(u);
  if (dist(at, CASTLES[viewer]) <= raceOf(m, viewer).castle.detect + CASTLE_RADIUS) return true;
  return m.towers.some(
    (t) => t.owner === viewer && t.def.detect !== undefined && dist(at, centreOf(t)) <= t.def.detect,
  );
}

/** The damage multiplier `owner`'s power auras give something standing at `at` (1 = none, at most doubled). */
export function powerAt(m: Match, owner: Owner, at: readonly [number, number]): number {
  let bonus = 0;
  for (const t of m.towers)
    if (t.owner === owner && t.def.aura?.kind === 'power' && dist(at, centreOf(t)) <= t.def.aura.radius)
      bonus += t.def.aura.amount;
  return Math.min(2, 1 + bonus);
}

// --- Commands --------------------------------------------------------------------------------------------------------

/** Pay for a unit; the castle trains it in turn (a queue of QUEUE_MAX) and sends it down the road. */
export function trainUnit(m: Match, owner: Owner, unitId: string): Result {
  if (m.winner >= 0) return 'over';
  const p = m.players[owner];
  const def = raceOf(m, owner).units.find((u) => u.id === unitId);
  if (!def) return 'unknown';
  if (def.tier > p.castle.level) return 'tier';
  if (p.queue.length >= QUEUE_MAX) return 'queue';
  if (p.gold < def.cost) return 'gold';
  p.gold -= def.cost;
  p.queue.push({ def, left: def.train });
  return 'ok';
}

/** Gold to take the castle up a level, or undefined at the top. */
export function upgradeCost(m: Match, owner: Owner): number | undefined {
  return raceOf(m, owner).castle.upgrades[m.players[owner].castle.level - 1];
}

/** Raise the castle a level: more build reach, pay and hit points, and the next tier of units and towers. */
export function upgradeCastle(m: Match, owner: Owner): Result {
  if (m.winner >= 0) return 'over';
  const p = m.players[owner];
  const cost = upgradeCost(m, owner);
  if (p.castle.level >= MAX_LEVEL || cost === undefined) return 'max';
  if (p.gold < cost) return 'gold';
  p.gold -= cost;
  p.castle.level++;
  const extra = raceOf(m, owner).castle.hpPerLevel;
  p.castle.maxHp += extra;
  p.castle.hp += extra;
  return 'ok';
}

/** Cells around the castle where towers may be built now. */
export const buildReach = (m: Match, owner: Owner) => raceOf(m, owner).castle.reach[m.players[owner].castle.level - 1]!;

export const towerAt = (m: Match, col: number, row: number) => m.towers.find((t) => t.col === col && t.row === row);

/** Is this cell inside the area `owner` may build in: the castle's reach, or the reach of one of their towers? */
export function inBuildArea(m: Match, owner: Owner, col: number, row: number): boolean {
  const c: [number, number] = [col + 0.5, row + 0.5];
  if (dist(c, CASTLES[owner]) <= buildReach(m, owner)) return true;
  return m.towers.some((t) => t.owner === owner && t.def.reach > 0 && dist(c, centreOf(t)) <= t.def.reach);
}

export type BuildResult = Result | 'off-board' | 'road' | 'taken' | 'castle' | 'area';

export function canBuild(m: Match, owner: Owner, def: TowerDef, col: number, row: number): BuildResult {
  if (m.winner >= 0) return 'over';
  if (!inBoard(col, row)) return 'off-board';
  if (ROAD_CELLS.has(cellIndex(col, row))) return 'road';
  const c: [number, number] = [col + 0.5, row + 0.5];
  if (CASTLES.some((k) => dist(c, k) < CASTLE_CLEAR)) return 'castle';
  if (towerAt(m, col, row)) return 'taken';
  if (def.tier > m.players[owner].castle.level) return 'tier';
  if (!inBuildArea(m, owner, col, row)) return 'area';
  if (m.players[owner].gold < def.cost) return 'gold';
  return 'ok';
}

export function buildTower(m: Match, owner: Owner, towerId: string, col: number, row: number): BuildResult {
  const def = raceOf(m, owner).towers.find((t) => t.id === towerId);
  if (!def) return 'unknown';
  const why = canBuild(m, owner, def, col, row);
  if (why !== 'ok') return why;
  m.players[owner].gold -= def.cost;
  m.towers.push({ id: m.nextId++, def, owner, col, row, hp: def.hp, cooldown: 0 });
  return 'ok';
}

// --- The step --------------------------------------------------------------------------------------------------------

const bounty = (def: UnitDef) => Math.max(1, Math.round(def.cost / def.count / 3));
/** Spacing (cells) between units that walk out together. */
const SPACING = 0.5;

type Target = { kind: 'unit'; unit: Unit } | { kind: 'tower'; tower: Tower } | { kind: 'castle'; owner: Owner };

/** What an attacker can reach: air and/or ground units, and (if `buildings`) towers and the castle. */
interface Reach {
  owner: Owner;
  from: readonly [number, number];
  range: number;
  ground: boolean;
  air: boolean;
  buildings: boolean;
}

const canHit = (m: Match, r: Pick<Reach, 'owner' | 'ground' | 'air'>, u: Unit) =>
  u.owner !== r.owner && u.hp > 0 && (u.def.air ? r.air : r.ground) && visibleTo(m, u, r.owner);

/** The nearest thing the attacker can hit within its range. */
function pick(m: Match, r: Reach): Target | undefined {
  let best: Target | undefined;
  let bestDist = Infinity;
  for (const u of m.units) {
    if (!canHit(m, r, u)) continue;
    const d = dist(r.from, unitPos(u));
    if (d <= r.range && d < bestDist) {
      best = { kind: 'unit', unit: u };
      bestDist = d;
    }
  }
  if (r.buildings) {
    for (const t of m.towers) {
      if (t.owner === r.owner || t.hp <= 0) continue;
      const d = dist(r.from, centreOf(t)) - TOWER_RADIUS;
      if (d <= r.range && d < bestDist) {
        best = { kind: 'tower', tower: t };
        bestDist = d;
      }
    }
    const foe = enemy(r.owner);
    const d = dist(r.from, CASTLES[foe]) - CASTLE_RADIUS;
    if (m.players[foe].castle.hp > 0 && d <= r.range && d < bestDist) best = { kind: 'castle', owner: foe };
  }
  return best;
}

const targetPoint = (t: Target): [number, number] =>
  t.kind === 'unit' ? unitPos(t.unit) : t.kind === 'tower' ? centreOf(t.tower) : CASTLES[t.owner];

interface Blow {
  damage: number;
  splash: number;
  dot?: { dps: number; seconds: number };
}

/** Hurt a target (and, with splash, the enemy units near it that the attacker can hit; poison renews on each). */
function strike(m: Match, r: Reach, t: Target, blow: Blow) {
  const at = targetPoint(t);
  const burn = (u: Unit) => {
    u.hp -= blow.damage;
    if (blow.dot) u.dot = { dps: blow.dot.dps, left: blow.dot.seconds };
  };
  if (t.kind === 'unit') burn(t.unit);
  else if (t.kind === 'tower') t.tower.hp -= blow.damage;
  else m.players[t.owner].castle.hp -= blow.damage;
  if (blow.splash > 0)
    for (const u of m.units)
      if (canHit(m, r, u) && !(t.kind === 'unit' && u === t.unit) && dist(at, unitPos(u)) <= blow.splash) burn(u);
}

export function step(m: Match, dt: number): void {
  m.shots.length = 0;
  m.deaths.length = 0;
  m.razed.length = 0;
  if (m.winner >= 0) return;
  m.time += dt;

  m.payTimer += dt;
  while (m.payTimer >= PAY_EVERY) {
    m.payTimer -= PAY_EVERY;
    for (const o of [0, 1] as const) {
      const p = m.players[o];
      p.gold += BASE_PAY + raceOf(m, o).castle.pay[p.castle.level - 1]!;
    }
  }

  // Castles train: the head of the queue counts down, then its units step out.
  for (const o of [0, 1] as const) {
    const q = m.players[o].queue;
    const head = q[0];
    if (!head) continue;
    head.left -= dt;
    if (head.left > 0) continue;
    q.shift();
    for (let i = 0; i < head.def.count; i++)
      m.units.push({ id: m.nextId++, def: head.def, owner: o, hp: head.def.hp, s: i * SPACING, cooldown: 0 });
  }

  // Poison burns, and healing auras mend.
  for (const u of m.units) {
    if (!u.dot) continue;
    u.hp -= u.dot.dps * dt;
    u.dot.left -= dt;
    if (u.dot.left <= 0) delete u.dot;
  }
  for (const t of m.towers) {
    const aura = t.def.aura;
    if (aura?.kind !== 'heal' || t.hp <= 0) continue;
    const c = centreOf(t);
    const mend = aura.amount * dt;
    for (const u of m.units)
      if (u.owner === t.owner && u.hp > 0 && dist(c, unitPos(u)) <= aura.radius) u.hp = Math.min(u.def.hp, u.hp + mend);
    for (const o of m.towers)
      if (o.owner === t.owner && o.hp > 0 && dist(c, centreOf(o)) <= aura.radius)
        o.hp = Math.min(o.def.hp, o.hp + mend);
    const k = m.players[t.owner].castle;
    if (k.hp > 0 && dist(c, CASTLES[t.owner]) <= aura.radius + CASTLE_RADIUS) k.hp = Math.min(k.maxHp, k.hp + mend);
  }

  // Units fight what is in reach, or walk on.
  for (const u of m.units) {
    u.cooldown -= dt;
    const from = unitPos(u);
    const reach: Reach = {
      owner: u.owner,
      from,
      range: u.def.range,
      ground: true,
      air: !!u.def.hitsAir,
      buildings: true,
    };
    const target = pick(m, reach);
    if (target) {
      if (u.cooldown <= 0) {
        u.cooldown = u.def.cooldown;
        m.shots.push({ from, to: targetPoint(target), melee: u.def.range <= 1.5, splash: 0 });
        strike(m, reach, target, { damage: u.def.damage * powerAt(m, u.owner, from), splash: 0 });
      }
    } else u.s = Math.min(goalOf(u.def), u.s + u.def.speed * dt);
  }

  // Towers and castles shoot units.
  for (const t of m.towers) {
    t.cooldown -= dt;
    if (t.cooldown > 0 || t.hp <= 0 || t.def.damage <= 0) continue;
    const from = centreOf(t);
    const reach: Reach = {
      owner: t.owner,
      from,
      range: t.def.range,
      ground: t.def.hits !== 'air',
      air: t.def.hits !== 'ground',
      buildings: false,
    };
    const target = pick(m, reach);
    if (!target) continue;
    t.cooldown = t.def.cooldown;
    m.shots.push({ from, to: targetPoint(target), melee: false, splash: t.def.splash });
    strike(m, reach, target, {
      damage: t.def.damage * powerAt(m, t.owner, from),
      splash: t.def.splash,
      dot: t.def.dot,
    });
  }
  for (const o of [0, 1] as const) {
    const c = m.players[o].castle;
    c.cooldown -= dt;
    if (c.cooldown > 0) continue;
    const def = raceOf(m, o).castle;
    const reach: Reach = {
      owner: o,
      from: CASTLES[o],
      range: def.range + CASTLE_RADIUS,
      ground: true,
      air: true,
      buildings: false,
    };
    const target = pick(m, reach);
    if (!target) continue;
    c.cooldown = def.cooldown;
    m.shots.push({ from: CASTLES[o], to: targetPoint(target), melee: false, splash: 0 });
    strike(m, reach, target, { damage: def.damage, splash: 0 });
  }

  // The fallen: the other side is paid for units; a razed tower is just gone.
  m.units = m.units.filter((u) => {
    if (u.hp > 0) return true;
    m.deaths.push({ at: unitPos(u), owner: u.owner, def: u.def, s: u.s });
    m.players[enemy(u.owner)].gold += bounty(u.def);
    return false;
  });
  m.towers = m.towers.filter((t) => {
    if (t.hp > 0) return true;
    m.razed.push({ col: t.col, row: t.row });
    return false;
  });

  const [a, b] = m.players;
  if (a.castle.hp <= 0 || b.castle.hp <= 0)
    m.winner = a.castle.hp <= 0 && b.castle.hp <= 0 ? 2 : a.castle.hp <= 0 ? 1 : 0;
  else if (m.time >= TIME_LIMIT) {
    const [ra, rb] = [a.castle.hp / a.castle.maxHp, b.castle.hp / b.castle.maxHp];
    m.winner = ra === rb ? 2 : ra > rb ? 0 : 1;
  }
}
