// The rules of a match (Pixi-free, deterministic: the same commands at the same times give the same game, so it is unit-tested
// without a browser and can later run on a server). Two castles at the ends of one road. A castle trains units, which march
// toward the enemy castle and fight whatever is in reach on the way: units hit units, towers and the castle. Towers hit units
// only. Towers go within the castle's build reach (grown by upgrading it) or the reach of a tower already built, so a front
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
  /** Cells walked from its own castle toward the other. */
  s: number;
  cooldown: number;
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

/** Where a unit is, in cells: along the road from its own castle. */
export function unitPos(u: Pick<Unit, 'owner' | 's'>): [number, number] {
  return pointAt(u.owner === 0 ? u.s : ROAD_LENGTH - u.s);
}

const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centreOf = (t: { col: number; row: number }): [number, number] => [t.col + 0.5, t.row + 0.5];

export type Result = 'ok' | 'over' | 'gold' | 'unknown' | 'tier' | 'queue' | 'max';

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

/** The nearest thing `owner`'s attacker at `from` can hit within `range`: enemy units, and (if `buildings`) towers and the castle. */
function pick(
  m: Match,
  owner: Owner,
  from: readonly [number, number],
  range: number,
  buildings: boolean,
): Target | undefined {
  let best: Target | undefined;
  let bestDist = Infinity;
  for (const u of m.units) {
    if (u.owner === owner || u.hp <= 0) continue;
    const d = dist(from, unitPos(u));
    if (d <= range && d < bestDist) {
      best = { kind: 'unit', unit: u };
      bestDist = d;
    }
  }
  if (buildings) {
    for (const t of m.towers) {
      if (t.owner === owner || t.hp <= 0) continue;
      const d = dist(from, centreOf(t)) - TOWER_RADIUS;
      if (d <= range && d < bestDist) {
        best = { kind: 'tower', tower: t };
        bestDist = d;
      }
    }
    const foe = enemy(owner);
    const d = dist(from, CASTLES[foe]) - CASTLE_RADIUS;
    if (m.players[foe].castle.hp > 0 && d <= range && d < bestDist) best = { kind: 'castle', owner: foe };
  }
  return best;
}

const targetPoint = (t: Target): [number, number] =>
  t.kind === 'unit' ? unitPos(t.unit) : t.kind === 'tower' ? centreOf(t.tower) : CASTLES[t.owner];

/** Hurt a target (and, with `splash`, the enemy units near it). */
function strike(m: Match, owner: Owner, t: Target, damage: number, splash: number) {
  const at = targetPoint(t);
  if (t.kind === 'unit') t.unit.hp -= damage;
  else if (t.kind === 'tower') t.tower.hp -= damage;
  else m.players[t.owner].castle.hp -= damage;
  if (splash > 0)
    for (const u of m.units)
      if (u.owner !== owner && !(t.kind === 'unit' && u === t.unit) && dist(at, unitPos(u)) <= splash) u.hp -= damage;
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

  // Units fight what is in reach, or walk on.
  const goal = ROAD_LENGTH - CASTLE_RADIUS;
  for (const u of m.units) {
    u.cooldown -= dt;
    const from = unitPos(u);
    const target = pick(m, u.owner, from, u.def.range, true);
    if (target) {
      if (u.cooldown <= 0) {
        u.cooldown = u.def.cooldown;
        m.shots.push({ from, to: targetPoint(target), melee: u.def.range <= 1.5, splash: 0 });
        strike(m, u.owner, target, u.def.damage, 0);
      }
    } else u.s = Math.min(goal, u.s + u.def.speed * dt);
  }

  // Towers and castles shoot units.
  for (const t of m.towers) {
    t.cooldown -= dt;
    if (t.cooldown > 0 || t.hp <= 0) continue;
    const from = centreOf(t);
    const target = pick(m, t.owner, from, t.def.range, false);
    if (!target) continue;
    t.cooldown = t.def.cooldown;
    m.shots.push({ from, to: targetPoint(target), melee: false, splash: t.def.splash });
    strike(m, t.owner, target, t.def.damage, t.def.splash);
  }
  for (const o of [0, 1] as const) {
    const c = m.players[o].castle;
    c.cooldown -= dt;
    if (c.cooldown > 0) continue;
    const def = raceOf(m, o).castle;
    const target = pick(m, o, CASTLES[o], def.range + CASTLE_RADIUS, false);
    if (!target) continue;
    c.cooldown = def.cooldown;
    m.shots.push({ from: CASTLES[o], to: targetPoint(target), melee: false, splash: 0 });
    strike(m, o, target, def.damage, 0);
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
