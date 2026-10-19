// The rules of a match (Pixi-free, deterministic: the same commands at the same times give the same game, so it is unit-tested
// without a browser and can later run on a server). Two castles at the ends of one road. Everything costs wood and stone (the
// castle's income, plus what each side's mills and quarries add every pay day) and a purchase is instant: no queue, no wait.
// The castle sells its base unit; the other units are unlocked by the producer buildings standing (`TowerDef.trains`), and a
// smithy-type building hosts upgrades. Units march along the road toward the enemy castle (flyers follow it too, over everything)
// and fight what is in reach: units hit units, towers and the castle, some in a blast (`splash`), several at once (`multi`) or by
// blowing themselves up (`suicide`); a unit that cannot reach a tower from the road steps straight off it, square to the road
// and never diagonally, and back again when the tower is down. Towers hit units only, each its own kind (ground, air or both; area
// damage; poison); some only help (an aura, a detector), some host units (a bunker holds ranged units that shoot from it), some
// make money or unlock units. Cloaked units are unseen unless a detector of the other side is near. Buildings go within the
// castle's build reach (grown by upgrading it) or the reach of a tower already built, so a front line is pushed forward tower by
// tower. Fog of war: each side sees round its castle, towers and units (and the ground it may build on); only units may clear
// fog temporarily, and never build there. What a side cannot see it cannot target. Only the castle must fall: the first destroyed
// loses, but razing buildings cuts the foe's income, units and upgrades.

import { CASTLE_CLEAR, DEFAULT_BOARD, type Board } from './board';
import {
  MAX_LEVEL,
  RACES,
  type Race,
  REACH_SCALE,
  type Cost,
  type RaceId,
  type TowerDef,
  type UnitDef,
  type UpgradeDef,
  price,
} from './races';

export const START_RES: Cost = price(120, 40);
export const PAY_EVERY = 5;
/** A match that goes on this long (seconds) is decided on castle hit points left. */
export const TIME_LIMIT = 1200;
/** Units one side may have alive at once (there is no queue to hold them back, so the rules do). */
export const UNIT_CAP = 120;
/** How far (cells) a castle's body reaches: attackers hit its edge, not its centre. */
export const CASTLE_RADIUS = 1.2;
const TOWER_RADIUS = 0.5;
/** The farthest (cells, square to the road) a unit will step off it to take a tower down, in the game's own races' scale. */
export const DETOUR_MAX = 9 * REACH_SCALE;

export type Owner = 0 | 1;

export interface Unit {
  id: number;
  def: UnitDef;
  owner: Owner;
  hp: number;
  maxHp: number;
  /** Cells walked from its own castle along the road (a flyer follows the road too). */
  s: number;
  cooldown: number;
  /** Poison on it: hit points lost a second, for `left` more seconds. */
  dot?: { dps: number; left: number };
  /** Off the road to take a tower down: straight across from the road (`dir`, one axis), `d` cells out, at most `max`. */
  off?: { tower: number; dir: [number, number]; d: number; max: number };
  /** Blew itself up (no bounty for the foe). */
  spent?: boolean;
  /** Sent after one thing by its player: a particular enemy tower, or the castle. It ignores the rest (orders) until that tower falls. */
  focus?: Focus;
}

/** What a unit may be sent after: one enemy tower (by id) or the enemy castle. */
export type Focus = { kind: 'tower'; id: number } | { kind: 'castle' };

/** A unit loaded into a bunker: it shoots from there on its own cooldown. */
export interface Garrisoned {
  def: UnitDef;
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
  garrison: Garrisoned[];
}

export interface Castle {
  hp: number;
  maxHp: number;
  level: number;
  cooldown: number;
}

/** What this player's units do about what they meet on the way: stop and fight it, or walk on past it. */
export interface Orders {
  towers: 'attack' | 'bypass';
  units: 'attack' | 'bypass';
}

export interface Player {
  race: RaceId;
  wood: number;
  stone: number;
  castle: Castle;
  /** Levels bought of each upgrade line (by `UpgradeDef.id`). */
  upgrades: Record<string, number>;
  /** Orders for every unit this player has, now and later: the castle is always attacked once in reach. */
  orders: Orders;
}

/** An attack made this step, for the renderer: from a point to a point, in cells; `melee` is a blow, not a missile. */
export interface Shot {
  /** Who made it (a unit's or tower's id, or a castle's owner), so the renderer can play that attacker's swing. */
  by: { kind: 'unit' | 'tower' | 'castle'; id: number };
  from: [number, number];
  to: [number, number];
  melee: boolean;
  splash: number;
  /** One of several struck at once (a flame, a sweeping blade): drawn as a spray, not a missile. */
  multi?: boolean;
}

/** A unit killed this step, where it fell, for the renderer to play its death. */
export interface Death {
  at: [number, number];
  /** Which way it was walking (0 = down the road from the start, 1 = back up it). */
  owner: Owner;
  def: UnitDef;
  s: number;
  /** It blew itself up: the blast's radius (cells). */
  boom?: number;
}

export interface Match {
  /** The map: the road, the castles, the scenery. */
  board: Board;
  /** The races' numbers it is played by (the game's `RACES`; a test may play the written-down ones on a small field). */
  races: Record<RaceId, Race>;
  /** The farthest (cells, square to the road) a unit will step off it to take a tower down. */
  detourMax: number;
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

export function newMatch(
  races: [RaceId, RaceId],
  board: Board = DEFAULT_BOARD,
  rules: { races: Record<RaceId, Race>; detourMax: number } = { races: RACES, detourMax: DETOUR_MAX },
): Match {
  const player = (race: RaceId): Player => {
    const hp = rules.races[race].castle.hp;
    return {
      race,
      wood: START_RES.wood,
      stone: START_RES.stone,
      castle: { hp, maxHp: hp, level: 1, cooldown: 0 },
      upgrades: {},
      orders: { towers: 'attack', units: 'attack' },
    };
  };
  return {
    board,
    ...rules,
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
export const raceOf = (m: Match, o: Owner) => m.races[m.players[o].race];

/** Where a unit is, in cells: along the road from its own castle (a flyer too), and off to the side when it has stepped off the road. */
export function unitPos(u: Pick<Unit, 'owner' | 's' | 'off'>, board: Board = DEFAULT_BOARD): [number, number] {
  const [x, y] = board.pointAt(u.owner === 0 ? u.s : board.roadLength - u.s);
  return u.off ? [x + u.off.dir[0] * u.off.d, y + u.off.dir[1] * u.off.d] : [x, y];
}

const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centreOf = (t: { col: number; row: number }): [number, number] => [t.col + 0.5, t.row + 0.5];

export type Result =
  'ok' | 'over' | 'gold' | 'unknown' | 'tier' | 'max' | 'needs' | 'limit' | 'cap' | 'full' | 'nobunker';

// --- Money -----------------------------------------------------------------------------------------------------------

export const canAfford = (p: Pick<Player, 'wood' | 'stone'>, c: Cost) => p.wood >= c.wood && p.stone >= c.stone;
const pay = (p: Pick<Player, 'wood' | 'stone'>, c: Cost) => {
  p.wood -= c.wood;
  p.stone -= c.stone;
};
const earn = (p: Pick<Player, 'wood' | 'stone'>, c: Partial<Cost>) => {
  p.wood += c.wood ?? 0;
  p.stone += c.stone ?? 0;
};

/** What `owner` earns every pay day: the castle's income at its level plus every standing mill and quarry. */
export function incomeOf(m: Match, owner: Owner): Cost {
  const p = m.players[owner];
  const base = raceOf(m, owner).castle.income[p.castle.level - 1]!;
  const out = { ...base };
  for (const t of m.towers)
    if (t.owner === owner && t.hp > 0 && t.def.econ) {
      out.wood += t.def.econ.wood ?? 0;
      out.stone += t.def.econ.stone ?? 0;
    }
  return out;
}

// --- Buildings that must stand, and upgrades ---------------------------------------------------------------------------

/** Does `owner` have this building standing? */
export const hasBuilding = (m: Match, owner: Owner, id: string) =>
  m.towers.some((t) => t.owner === owner && t.hp > 0 && t.def.id === id);

/** Can `owner` buy this unit now, apart from the money: the castle level and the building it needs. */
export function unitUnlocked(m: Match, owner: Owner, def: UnitDef): 'ok' | 'tier' | 'needs' {
  if (def.tier > m.players[owner].castle.level) return 'tier';
  if (def.needs && !hasBuilding(m, owner, def.needs)) return 'needs';
  return 'ok';
}

/** Can `owner` build this kind of building now, apart from where and the money: the castle level, the building it needs, its limit. */
export function towerUnlocked(m: Match, owner: Owner, def: TowerDef): 'ok' | 'tier' | 'needs' | 'limit' {
  if (def.tier > m.players[owner].castle.level) return 'tier';
  if (def.needs && !hasBuilding(m, owner, def.needs)) return 'needs';
  if (def.limit !== undefined && m.towers.filter((t) => t.owner === owner && t.def.id === def.id).length >= def.limit)
    return 'limit';
  return 'ok';
}

/** The levels `owner` has bought of an upgrade line. */
export const upgradeLevel = (m: Match, owner: Owner, id: string) => m.players[owner].upgrades[id] ?? 0;

/** What a side's upgrades multiply a unit's `damage` or `hp` by (1 = nothing bought). */
export function boostOf(m: Match, owner: Owner, def: Pick<UnitDef, 'air'>, stat: UpgradeDef['stat']): number {
  let bonus = 0;
  for (const up of raceOf(m, owner).upgrades)
    if (up.stat === stat && up.applies === (def.air ? 'air' : 'ground'))
      bonus += up.perLevel * upgradeLevel(m, owner, up.id);
  return 1 + bonus;
}

/** The next level of an upgrade line: its price and castle level, or nothing at the top. */
export function nextUpgrade(m: Match, owner: Owner, up: UpgradeDef) {
  return up.levels[upgradeLevel(m, owner, up.id)];
}

/** Buy the next level of an upgrade line (instant): needs its building, the castle level and the money. */
export function buyUpgrade(m: Match, owner: Owner, id: string): Result {
  if (m.winner >= 0) return 'over';
  const up = raceOf(m, owner).upgrades.find((u) => u.id === id);
  if (!up) return 'unknown';
  const next = nextUpgrade(m, owner, up);
  if (!next) return 'max';
  const p = m.players[owner];
  if (next.tier > p.castle.level) return 'tier';
  if (!hasBuilding(m, owner, up.needs)) return 'needs';
  if (!canAfford(p, next.cost)) return 'gold';
  pay(p, next.cost);
  p.upgrades[id] = upgradeLevel(m, owner, id) + 1;
  return 'ok';
}

// --- Sight and auras -------------------------------------------------------------------------------------------------

/** Can `viewer` detect this unit? A cloaked one only within a detector (tower, or the castle's own sight) of the viewer's. */
export function visibleTo(m: Match, u: Unit, viewer: Owner): boolean {
  if (!u.def.cloak || u.owner === viewer) return true;
  const at = unitPos(u, m.board);
  if (dist(at, m.board.castles[viewer]) <= raceOf(m, viewer).castle.detect + CASTLE_RADIUS) return true;
  return m.towers.some(
    (t) => t.owner === viewer && t.def.detect !== undefined && dist(at, centreOf(t)) <= t.def.detect,
  );
}

// --- Fog of war ------------------------------------------------------------------------------------------------------
// Everything a player owns sees a circle round it. The ground the player may build on (the castle's reach, the reach of
// their towers) is revealed for good (`build`); towers and the castle also see round them as long as they stand; units see
// round them only while they live (`temporary`), and never reveal ground to build on. Enemy units, towers and castle outside
// every circle are hidden and so cannot be targeted. A cloaked unit must be both inside a circle and detected (`visibleTo`).

/** One circle of vision, in cells. */
export interface Sight {
  /** Which source it is (stable while that source lives): the renderer animates each pool by it. */
  key: string;
  x: number;
  y: number;
  r: number;
  /** Part of the build area (permanent ground you may build on). */
  build: boolean;
  /** Given by a unit: gone when it dies or walks on. */
  temporary: boolean;
}

/** Everything each player sees, by owner (compute once per step or frame with `visionOf`, then ask `canSee`). */
export type Vision = readonly [readonly Sight[], readonly Sight[]];

/** The circles `owner` sees through now. */
export function sightOf(m: Match, owner: Owner): Sight[] {
  const castle = raceOf(m, owner).castle;
  const [cx, cy] = m.board.castles[owner];
  const out: Sight[] = [
    { key: 'c:build', x: cx, y: cy, r: buildReach(m, owner), build: true, temporary: false },
    { key: 'c:sight', x: cx, y: cy, r: castle.sight, build: false, temporary: false },
  ];
  for (const t of m.towers) {
    if (t.owner !== owner || t.hp <= 0) continue;
    const [x, y] = centreOf(t);
    out.push({ key: `t${t.id}:sight`, x, y, r: t.def.sight, build: false, temporary: false });
    if (t.def.reach > 0) out.push({ key: `t${t.id}:build`, x, y, r: t.def.reach, build: true, temporary: false });
  }
  for (const u of m.units) {
    if (u.owner !== owner || u.hp <= 0) continue;
    const [x, y] = unitPos(u, m.board);
    out.push({ key: `u${u.id}`, x, y, r: u.def.sight, build: false, temporary: true });
  }
  return out;
}

export const visionOf = (m: Match): Vision => [sightOf(m, 0), sightOf(m, 1)];

/** Can `viewer` see this point (cells)? `pad` widens every circle (a body has a size: see a tower or castle by its edge). */
export function canSee(m: Match, viewer: Owner, at: readonly [number, number], pad = 0, vision = visionOf(m)): boolean {
  for (const s of vision[viewer]) if (Math.hypot(at[0] - s.x, at[1] - s.y) <= s.r + pad) return true;
  return false;
}

/** Can `viewer` see this unit: its own always; another's when it is in sight and, if cloaked, detected too. */
export function isSeen(m: Match, viewer: Owner, e: Unit | Tower, vision = visionOf(m)): boolean {
  if (e.owner === viewer) return true;
  if ('col' in e) return canSee(m, viewer, centreOf(e), TOWER_RADIUS, vision);
  return canSee(m, viewer, unitPos(e, m.board), 0, vision) && visibleTo(m, e, viewer);
}

/** Can `viewer` see `owner`'s castle? Their own always. */
export function isCastleSeen(m: Match, viewer: Owner, owner: Owner, vision = visionOf(m)): boolean {
  return owner === viewer || canSee(m, viewer, m.board.castles[owner], CASTLE_RADIUS, vision);
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

/** Spacing (cells) between units that walk out together. */
const SPACING = 0.5;
/** The first stretch of road (cells) a crowd of new units is spread over. */
const SPREAD = 9;

/** Buy a unit: it appears at the castle at once and marches. Needs the castle level, the building that unlocks it and the money. */
export function trainUnit(m: Match, owner: Owner, unitId: string): Result {
  if (m.winner >= 0) return 'over';
  const p = m.players[owner];
  const def = raceOf(m, owner).units.find((u) => u.id === unitId);
  if (!def) return 'unknown';
  const open = unitUnlocked(m, owner, def);
  if (open !== 'ok') return open;
  if (m.units.reduce((n, u) => n + (u.owner === owner ? 1 : 0), 0) + def.count > UNIT_CAP) return 'cap';
  if (!canAfford(p, def.cost)) return 'gold';
  pay(p, def.cost);
  const maxHp = def.hp * boostOf(m, owner, def, 'hp');
  // Units that walk out together are spread along the first stretch of road (a crowd bought at once is not one stack on one spot).
  const queued = m.units.reduce((n, u) => n + (u.owner === owner && u.s < SPREAD ? 1 : 0), 0);
  for (let i = 0; i < def.count; i++)
    m.units.push({
      id: m.nextId++,
      def,
      owner,
      hp: maxHp,
      maxHp,
      s: Math.min(SPREAD, i * SPACING + queued * SPACING),
      cooldown: 0,
    });
  return 'ok';
}

/** How many purchases of this unit `owner` can make right now: limited by wood, stone, the unit cap and what the castle and buildings unlock. */
export function maxPurchases(m: Match, owner: Owner, def: UnitDef): number {
  if (m.winner >= 0 || unitUnlocked(m, owner, def) !== 'ok') return 0;
  const p = m.players[owner];
  const own = m.units.reduce((n, u) => n + (u.owner === owner ? 1 : 0), 0);
  const byMoney = Math.min(
    def.cost.wood > 0 ? Math.floor(p.wood / def.cost.wood) : Infinity,
    def.cost.stone > 0 ? Math.floor(p.stone / def.cost.stone) : Infinity,
  );
  return Math.max(0, Math.min(byMoney, Math.floor((UNIT_CAP - own) / def.count)));
}

/** Buy up to `n` purchases of a unit at once (the slider): how many were bought. */
export function trainUnits(m: Match, owner: Owner, unitId: string, n: number): number {
  let bought = 0;
  while (bought < n && trainUnit(m, owner, unitId) === 'ok') bought++;
  return bought;
}

/** What it costs to load one soldier of a purchase into a bunker: its share of the price. */
export const soldierCost = (def: UnitDef): Cost =>
  price(Math.ceil(def.cost.wood / def.count), Math.ceil(def.cost.stone / def.count));

/** Load one ranged unit into one of `owner`'s bunkers (instant): it shoots from there for as long as the bunker stands. */
export function loadBunker(m: Match, owner: Owner, towerId: number, unitId: string): Result {
  if (m.winner >= 0) return 'over';
  const t = m.towers.find((x) => x.id === towerId && x.owner === owner && x.hp > 0);
  const def = raceOf(m, owner).units.find((u) => u.id === unitId);
  if (!t || !def) return 'unknown';
  if (!t.def.bunker || !def.garrison) return 'nobunker';
  const open = unitUnlocked(m, owner, def);
  if (open !== 'ok') return open;
  if (t.garrison.length >= t.def.bunker.slots) return 'full';
  const p = m.players[owner];
  const cost = soldierCost(def);
  if (!canAfford(p, cost)) return 'gold';
  pay(p, cost);
  t.garrison.push({ def, cooldown: 0 });
  return 'ok';
}

/** Tell all of a player's units to fight what they meet (`attack`) or walk on past it (`bypass`): `what` is towers or units. */
export function setOrder(m: Match, owner: Owner, what: keyof Orders, to: Orders[keyof Orders]): void {
  m.players[owner].orders[what] = to;
}

/** Can a unit of this kind take this tower down: from the road with its range, or by stepping off it (at most `Match.detourMax` cells)? */
export function canTarget(m: Match, def: Pick<UnitDef, 'range'>, t: Tower): boolean {
  const foot = m.board.footOf(t.col, t.row);
  return !!foot && (foot.d - TOWER_RADIUS <= def.range || foot.d <= m.detourMax);
}

/**
 * Send these units (ids, `owner`'s own) after one enemy tower or the enemy castle, or back to the general orders (`undefined`).
 * A unit sent after a tower fights only that tower; one sent after the castle walks past everything and fights only it.
 */
export function setFocus(
  m: Match,
  owner: Owner,
  unitIds: readonly number[],
  focus: Focus | undefined,
): Result | 'unreachable' {
  if (m.winner >= 0) return 'over';
  const mine = m.units.filter((u) => u.owner === owner && unitIds.includes(u.id) && !u.spent);
  if (focus?.kind === 'tower') {
    const t = m.towers.find((x) => x.id === focus.id && x.owner !== owner && x.hp > 0);
    if (!t) return 'unknown';
    if (!mine.some((u) => canTarget(m, u.def, t))) return 'unreachable';
    for (const u of mine) if (canTarget(m, u.def, t)) u.focus = focus;
    return 'ok';
  }
  for (const u of mine) {
    if (focus) u.focus = focus;
    else delete u.focus;
  }
  return 'ok';
}

/** What it costs to take the castle up a level, or undefined at the top. */
export function upgradeCost(m: Match, owner: Owner): Cost | undefined {
  return raceOf(m, owner).castle.upgrades[m.players[owner].castle.level - 1];
}

/** Raise the castle a level: more build reach, income and hit points, and the next tier of units and towers. */
export function upgradeCastle(m: Match, owner: Owner): Result {
  if (m.winner >= 0) return 'over';
  const p = m.players[owner];
  const cost = upgradeCost(m, owner);
  if (p.castle.level >= MAX_LEVEL || cost === undefined) return 'max';
  if (!canAfford(p, cost)) return 'gold';
  pay(p, cost);
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
  if (dist(c, m.board.castles[owner]) <= buildReach(m, owner)) return true;
  return m.towers.some((t) => t.owner === owner && t.def.reach > 0 && dist(c, centreOf(t)) <= t.def.reach);
}

export type BuildResult = Result | 'off-board' | 'road' | 'scenery' | 'taken' | 'castle' | 'area';

export function canBuild(m: Match, owner: Owner, def: TowerDef, col: number, row: number): BuildResult {
  if (m.winner >= 0) return 'over';
  const b = m.board;
  if (!b.inBoard(col, row)) return 'off-board';
  if (b.roadCells.has(b.cellIndex(col, row))) return 'road';
  if (b.sceneryCells.has(b.cellIndex(col, row))) return 'scenery';
  const c: [number, number] = [col + 0.5, row + 0.5];
  if (b.castles.some((k) => dist(c, k) < CASTLE_CLEAR)) return 'castle';
  if (towerAt(m, col, row)) return 'taken';
  const open = towerUnlocked(m, owner, def);
  if (open !== 'ok') return open;
  if (!inBuildArea(m, owner, col, row)) return 'area';
  if (!canAfford(m.players[owner], def.cost)) return 'gold';
  return 'ok';
}

export function buildTower(m: Match, owner: Owner, towerId: string, col: number, row: number): BuildResult {
  const def = raceOf(m, owner).towers.find((t) => t.id === towerId);
  if (!def) return 'unknown';
  const why = canBuild(m, owner, def, col, row);
  if (why !== 'ok') return why;
  pay(m.players[owner], def.cost);
  m.towers.push({ id: m.nextId++, def, owner, col, row, hp: def.hp, cooldown: 0, garrison: [] });
  return 'ok';
}

// --- The step --------------------------------------------------------------------------------------------------------

/** A kill pays the killer this share (1/n) of the unit's price: the lever that makes a winning fight snowball. */
const BOUNTY_SHARE = 2;
const bounty = (def: UnitDef): Cost =>
  price(Math.round(def.cost.wood / def.count / BOUNTY_SHARE), Math.round(def.cost.stone / def.count / BOUNTY_SHARE));

type Target = { kind: 'unit'; unit: Unit } | { kind: 'tower'; tower: Tower } | { kind: 'castle'; owner: Owner };

/** What an attacker can reach: air and/or ground units (if `units`), towers (if `towers`) and the enemy castle (if `castle`). */
interface Reach {
  owner: Owner;
  /** The attacker, for the shot it makes. */
  by: Shot['by'];
  /** What every side sees this step: an attacker only hits what its owner sees. */
  vision: Vision;
  from: readonly [number, number];
  range: number;
  ground: boolean;
  air: boolean;
  units: boolean;
  towers: boolean;
  castle: boolean;
  /** Fight only this tower among the towers (a unit sent after it). */
  only?: number;
}

/** Could it hit this kind of unit at all (a cheap test, before distance and sight are asked)? */
const hittable = (r: Pick<Reach, 'owner' | 'ground' | 'air'>, u: Unit) =>
  u.owner !== r.owner && u.hp > 0 && (u.def.air ? r.air : r.ground);
const canHit = (m: Match, r: Pick<Reach, 'owner' | 'ground' | 'air' | 'vision'>, u: Unit) =>
  hittable(r, u) && isSeen(m, r.owner, u, r.vision);

/** The nearest thing the attacker can hit within its range. */
function pick(m: Match, r: Reach): Target | undefined {
  let best: Target | undefined;
  let bestDist = Infinity;
  for (const u of r.units ? m.units : []) {
    if (!hittable(r, u)) continue;
    const d = dist(r.from, unitPos(u, m.board));
    if (d <= r.range && d < bestDist && isSeen(m, r.owner, u, r.vision)) {
      best = { kind: 'unit', unit: u };
      bestDist = d;
    }
  }
  for (const t of r.towers ? m.towers : []) {
    if (t.owner === r.owner || t.hp <= 0 || (r.only !== undefined && t.id !== r.only)) continue;
    const d = dist(r.from, centreOf(t)) - TOWER_RADIUS;
    if (d <= r.range && d < bestDist && isSeen(m, r.owner, t, r.vision)) {
      best = { kind: 'tower', tower: t };
      bestDist = d;
    }
  }
  if (r.castle) {
    const foe = enemy(r.owner);
    const d = dist(r.from, m.board.castles[foe]) - CASTLE_RADIUS;
    if (m.players[foe].castle.hp > 0 && d <= r.range && d < bestDist && isCastleSeen(m, r.owner, foe, r.vision))
      best = { kind: 'castle', owner: foe };
  }
  return best;
}

const targetPoint = (m: Match, t: Target): [number, number] =>
  t.kind === 'unit' ? unitPos(t.unit, m.board) : t.kind === 'tower' ? centreOf(t.tower) : m.board.castles[t.owner];

interface Blow {
  damage: number;
  splash: number;
  dot?: { dps: number; seconds: number };
  /** Strike up to this many enemy units within range at once (the target and the nearest others). */
  multi: number;
  /** Multiplies damage against towers and castles. */
  siege: number;
  /** A blow, not a missile (for the renderer). */
  melee: boolean;
}

/**
 * Hurt a target and, by the blow, the others it reaches: with `splash` the enemy units (and, for an attacker that may fight towers,
 * towers) near it; with `multi` the nearest enemy units within the attacker's range. Poison renews on each.
 */
function strike(m: Match, r: Reach, t: Target, blow: Blow) {
  const at = targetPoint(m, t);
  const burn = (u: Unit) => {
    u.hp -= blow.damage;
    if (blow.dot) u.dot = { dps: blow.dot.dps, left: blow.dot.seconds };
  };
  m.shots.push({ by: r.by, from: [...r.from], to: at, melee: blow.melee, splash: blow.splash });
  if (t.kind === 'unit') burn(t.unit);
  else if (t.kind === 'tower') t.tower.hp -= blow.damage * blow.siege;
  else m.players[t.owner].castle.hp -= blow.damage * blow.siege;
  if (t.kind === 'unit' && blow.multi > 1) {
    const near = m.units
      .filter((u) => u !== t.unit && canHit(m, r, u) && dist(r.from, unitPos(u, m.board)) <= r.range)
      .map((u) => [u, dist(r.from, unitPos(u, m.board))] as const)
      .sort((a, b) => a[1] - b[1] || a[0].id - b[0].id)
      .slice(0, blow.multi - 1);
    for (const [u] of near) {
      burn(u);
      m.shots.push({ by: r.by, from: [...r.from], to: unitPos(u, m.board), melee: false, splash: 0, multi: true });
    }
  }
  if (blow.splash > 0) {
    for (const u of m.units)
      if (
        hittable(r, u) &&
        !(t.kind === 'unit' && u === t.unit) &&
        dist(at, unitPos(u, m.board)) <= blow.splash &&
        canHit(m, r, u)
      )
        burn(u);
    if (r.towers)
      for (const o of m.towers)
        if (
          o.owner !== r.owner &&
          o.hp > 0 &&
          !(t.kind === 'tower' && o === t.tower) &&
          dist(at, centreOf(o)) <= blow.splash + TOWER_RADIUS &&
          isSeen(m, r.owner, o, r.vision)
        )
          o.hp -= blow.damage * blow.siege;
  }
}

/** The tower a unit should step off the road for: one it can see, whose foot is on the stretch it walks this step, out of reach from the road. */
function detourFor(m: Match, u: Unit, vision: Vision, nextS: number, only?: number): Tower | undefined {
  let best: Tower | undefined;
  let bestD = Infinity;
  for (const t of m.towers) {
    if (t.owner === u.owner || t.hp <= 0 || (only !== undefined && t.id !== only)) continue;
    const foot = m.board.footOf(t.col, t.row);
    if (!foot || foot.d > m.detourMax || foot.d - TOWER_RADIUS <= u.def.range) continue;
    const s = u.owner === 0 ? foot.s : m.board.roadLength - foot.s;
    if (s < u.s - 1e-6 || s > nextS + 1e-6 || foot.d >= bestD || !isSeen(m, u.owner, t, vision)) continue;
    best = t;
    bestD = foot.d;
  }
  return best;
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
    for (const o of [0, 1] as const) earn(m.players[o], incomeOf(m, o));
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
      if (u.owner === t.owner && u.hp > 0 && dist(c, unitPos(u, m.board)) <= aura.radius)
        u.hp = Math.min(u.maxHp, u.hp + mend);
    for (const o of m.towers)
      if (o.owner === t.owner && o.hp > 0 && dist(c, centreOf(o)) <= aura.radius)
        o.hp = Math.min(o.def.hp, o.hp + mend);
    const k = m.players[t.owner].castle;
    if (k.hp > 0 && dist(c, m.board.castles[t.owner]) <= aura.radius + CASTLE_RADIUS)
      k.hp = Math.min(k.maxHp, k.hp + mend);
  }

  // What each side sees this step (units that spawned count; those about to die still do until the step ends).
  const vision = visionOf(m);

  // Units fight what is in reach, or walk on (stepping off the road to take a tower it cannot otherwise reach).
  for (const u of m.units) {
    if (u.spent) continue;
    u.cooldown -= dt;
    const from = unitPos(u, m.board);
    const orders = m.players[u.owner].orders;
    // A unit sent after a tower fights only it (and the castle only once it is down); one sent after the castle ignores the rest.
    const focused = u.focus?.kind === 'tower' ? u.focus.id : undefined;
    const sentAt = focused === undefined ? undefined : m.towers.find((t) => t.id === focused && t.hp > 0);
    if (focused !== undefined && !sentAt) delete u.focus;
    const towersOn = u.focus ? sentAt !== undefined : orders.towers === 'attack';
    const reach: Reach = {
      owner: u.owner,
      by: { kind: 'unit', id: u.id },
      vision,
      from,
      range: u.def.range,
      ground: true,
      air: !!u.def.hitsAir,
      units: u.focus ? false : orders.units === 'attack',
      towers: towersOn,
      castle: !sentAt,
      only: sentAt?.id,
    };
    const target = pick(m, reach);
    if (target) {
      if (u.cooldown > 0) continue;
      u.cooldown = u.def.cooldown;
      strike(m, reach, target, {
        damage: u.def.damage * boostOf(m, u.owner, u.def, 'damage') * powerAt(m, u.owner, from),
        splash: u.def.splash ?? 0,
        multi: u.def.multi ?? 1,
        siege: u.def.siege ?? 1,
        melee: u.def.range <= 1.5,
      });
      if (u.def.suicide) {
        u.hp = 0;
        u.spent = true;
      }
    } else if (u.off) {
      const off = u.off;
      const tower = m.towers.find((t) => t.id === off.tower);
      const wanted = tower !== undefined && tower.hp > 0 && towersOn;
      off.d = Math.min(off.max, off.d + (wanted ? 1 : -1) * u.def.speed * dt);
      if (off.d <= 0) delete u.off;
    } else {
      const next = Math.min(m.board.roadLength - CASTLE_RADIUS, u.s + u.def.speed * dt);
      const tower = towersOn ? detourFor(m, u, vision, next, sentAt?.id) : undefined;
      if (sentAt && next >= m.board.roadLength - CASTLE_RADIUS - 1e-6 && !tower) delete u.focus; // walked the road and never got at it
      if (tower) {
        const foot = m.board.footOf(tower.col, tower.row)!;
        u.s = u.owner === 0 ? foot.s : m.board.roadLength - foot.s;
        u.off = { tower: tower.id, dir: foot.dir, d: 0, max: Math.max(0, foot.d - TOWER_RADIUS) };
      } else u.s = next;
    }
  }

  // Towers and castles shoot units.
  for (const t of m.towers) {
    if (t.hp <= 0) continue;
    const from = centreOf(t);
    t.cooldown -= dt;
    if (t.cooldown <= 0 && t.def.damage > 0) {
      const reach: Reach = {
        owner: t.owner,
        by: { kind: 'tower', id: t.id },
        vision,
        from,
        range: t.def.range,
        ground: t.def.hits !== 'air',
        air: t.def.hits !== 'ground',
        units: true,
        towers: false,
        castle: false,
      };
      const target = pick(m, reach);
      if (target) {
        t.cooldown = t.def.cooldown;
        strike(m, reach, target, {
          damage: t.def.damage * powerAt(m, t.owner, from),
          splash: t.def.splash,
          dot: t.def.dot,
          multi: 1,
          siege: 1,
          melee: false,
        });
      }
    }
    // A bunker's soldiers shoot on their own cooldowns, each as its kind of unit does, a little further from the walls.
    for (const g of t.garrison) {
      g.cooldown -= dt;
      if (g.cooldown > 0) continue;
      const reach: Reach = {
        owner: t.owner,
        by: { kind: 'tower', id: t.id },
        vision,
        from,
        range: g.def.range + (t.def.bunker?.rangeBonus ?? 0),
        ground: true,
        air: !!g.def.hitsAir,
        units: true,
        towers: false,
        castle: false,
      };
      const target = pick(m, reach);
      if (!target) continue;
      g.cooldown = g.def.cooldown;
      strike(m, reach, target, {
        damage: g.def.damage * boostOf(m, t.owner, g.def, 'damage') * powerAt(m, t.owner, from),
        splash: g.def.splash ?? 0,
        multi: g.def.multi ?? 1,
        siege: 1,
        melee: false,
      });
    }
  }
  for (const o of [0, 1] as const) {
    const c = m.players[o].castle;
    c.cooldown -= dt;
    if (c.cooldown > 0) continue;
    const def = raceOf(m, o).castle;
    const reach: Reach = {
      owner: o,
      by: { kind: 'castle', id: o },
      vision,
      from: m.board.castles[o],
      range: def.range + CASTLE_RADIUS,
      ground: true,
      air: true,
      units: true,
      towers: false,
      castle: false,
    };
    const target = pick(m, reach);
    if (!target) continue;
    c.cooldown = def.cooldown;
    strike(m, reach, target, { damage: def.damage, splash: 0, multi: 1, siege: 1, melee: false });
  }

  // The fallen: the other side is paid for units (not for bombs that went off); a razed tower is just gone.
  m.units = m.units.filter((u) => {
    if (u.hp > 0) return true;
    m.deaths.push({
      at: unitPos(u, m.board),
      owner: u.owner,
      def: u.def,
      s: u.s,
      ...(u.spent && u.def.splash ? { boom: u.def.splash } : {}),
    });
    if (!u.spent) earn(m.players[enemy(u.owner)], bounty(u.def));
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
