// The rules of a match (Pixi-free, deterministic: the same commands at the same times give the same game, so it is
// unit-tested without a browser and can later run on a server). Two players each own a lane. You build towers along
// your own lane and send units down the OTHER lane; units that get through take the lane owner's lives. Gold comes in
// every pay day, more for every unit you have sent. Whoever runs out of lives first loses.

import { cellIndex, inBoard, pointAt, ROAD_CELLS, ROAD_LENGTH } from './board';
import { RACES, type RaceId, type TowerDef, type UnitDef } from './races';

export const START_GOLD = 120;
export const START_LIVES = 20;
export const PAY_EVERY = 5;
export const BASE_PAY = 10;
/** A match that goes on this long (seconds) is decided on lives left. */
export const TIME_LIMIT = 900;

export interface Unit {
  id: number;
  def: UnitDef;
  /** Who sent it. It walks the other player's lane. */
  owner: 0 | 1;
  hp: number;
  /** Cells walked (negative while it waits its turn to step out). */
  dist: number;
}

export interface Tower {
  id: number;
  def: TowerDef;
  owner: 0 | 1;
  col: number;
  row: number;
  cooldown: number;
}

export interface Player {
  race: RaceId;
  gold: number;
  lives: number;
  /** Gold added per pay day on top of `BASE_PAY`. */
  income: number;
}

/** A shot fired this step, for the renderer to draw. */
export interface Shot {
  lane: 0 | 1;
  from: [number, number];
  to: [number, number];
  splash: number;
}

/** A unit killed this step, for the renderer to play its death where it fell (one that leaks is not a death). */
export interface Death {
  lane: 0 | 1;
  dist: number;
  def: UnitDef;
  owner: 0 | 1;
}

export interface Match {
  time: number;
  payTimer: number;
  players: [Player, Player];
  units: Unit[];
  towers: Tower[];
  shots: Shot[];
  deaths: Death[];
  nextId: number;
  /** -1 still playing, 0 or 1 the winner, 2 a draw. */
  winner: -1 | 0 | 1 | 2;
}

export function newMatch(races: [RaceId, RaceId]): Match {
  const player = (race: RaceId): Player => ({ race, gold: START_GOLD, lives: START_LIVES, income: 0 });
  return {
    time: 0,
    payTimer: 0,
    players: [player(races[0]), player(races[1])],
    units: [],
    towers: [],
    shots: [],
    deaths: [],
    nextId: 1,
    winner: -1,
  };
}

export type Result = 'ok' | 'over' | 'gold' | 'unknown' | 'off-board' | 'road' | 'taken';

export function towerAt(m: Match, owner: 0 | 1, col: number, row: number): Tower | undefined {
  return m.towers.find((t) => t.owner === owner && t.col === col && t.row === row);
}

/** Can `owner` put a tower on this cell of their lane? (Says why not.) */
export function canBuild(m: Match, owner: 0 | 1, def: TowerDef, col: number, row: number): Result {
  if (m.winner >= 0) return 'over';
  if (!inBoard(col, row)) return 'off-board';
  if (ROAD_CELLS.has(cellIndex(col, row))) return 'road';
  if (towerAt(m, owner, col, row)) return 'taken';
  if (m.players[owner].gold < def.cost) return 'gold';
  return 'ok';
}

export function buildTower(m: Match, owner: 0 | 1, towerId: string, col: number, row: number): Result {
  const def = RACES[m.players[owner].race].towers.find((t) => t.id === towerId);
  if (!def) return 'unknown';
  const why = canBuild(m, owner, def, col, row);
  if (why !== 'ok') return why;
  m.players[owner].gold -= def.cost;
  m.towers.push({ id: m.nextId++, def, owner, col, row, cooldown: 0 });
  return 'ok';
}

/** Spacing (cells) between units that walk out together. */
const SPACING = 0.6;

export function sendUnits(m: Match, owner: 0 | 1, unitId: string): Result {
  if (m.winner >= 0) return 'over';
  const def = RACES[m.players[owner].race].units.find((u) => u.id === unitId);
  if (!def) return 'unknown';
  const p = m.players[owner];
  if (p.gold < def.cost) return 'gold';
  p.gold -= def.cost;
  p.income += def.income;
  for (let i = 0; i < def.count; i++) m.units.push({ id: m.nextId++, def, owner, hp: def.hp, dist: -i * SPACING });
  return 'ok';
}

/** The lane a unit walks: the one its sender does not own. */
export const laneOf = (u: Unit): 0 | 1 => (u.owner === 0 ? 1 : 0);

const bounty = (def: UnitDef) => Math.max(1, Math.round(def.cost / def.count / 4));

export function step(m: Match, dt: number): void {
  m.shots.length = 0;
  m.deaths.length = 0;
  if (m.winner >= 0) return;
  m.time += dt;

  m.payTimer += dt;
  while (m.payTimer >= PAY_EVERY) {
    m.payTimer -= PAY_EVERY;
    for (const p of m.players) p.gold += BASE_PAY + p.income;
  }

  for (const u of m.units) u.dist += u.def.speed * dt;
  m.units = m.units.filter((u) => {
    if (u.dist < ROAD_LENGTH) return true;
    m.players[laneOf(u)].lives -= u.def.leak;
    return false;
  });

  for (const t of m.towers) {
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const here = [t.col + 0.5, t.row + 0.5];
    let target: Unit | undefined;
    for (const u of m.units) {
      if (laneOf(u) !== t.owner || u.hp <= 0) continue;
      const [x, y] = pointAt(u.dist);
      if (Math.hypot(x - here[0]!, y - here[1]!) > t.def.range) continue;
      if (!target || u.dist > target.dist) target = u; // the one furthest along the road
    }
    if (!target) continue;
    t.cooldown = t.def.cooldown;
    const aim = pointAt(target.dist);
    m.shots.push({ lane: t.owner, from: [here[0]!, here[1]!], to: aim, splash: t.def.splash });
    for (const u of m.units) {
      if (laneOf(u) !== t.owner) continue;
      if (u === target) u.hp -= t.def.damage;
      else if (t.def.splash > 0) {
        const [x, y] = pointAt(u.dist);
        if (Math.hypot(x - aim[0], y - aim[1]) <= t.def.splash) u.hp -= t.def.damage;
      }
    }
  }

  m.units = m.units.filter((u) => {
    if (u.hp > 0) return true;
    // The defender is paid for what their towers kill.
    m.deaths.push({ lane: laneOf(u), dist: u.dist, def: u.def, owner: u.owner });
    m.players[laneOf(u)].gold += bounty(u.def);
    return false;
  });

  const [a, b] = m.players;
  if (a.lives <= 0 || b.lives <= 0) m.winner = a.lives <= 0 && b.lives <= 0 ? 2 : a.lives <= 0 ? 1 : 0;
  else if (m.time >= TIME_LIMIT) m.winner = a.lives === b.lives ? 2 : a.lives > b.lives ? 0 : 1;
}
