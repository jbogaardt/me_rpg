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

import { hypot } from './hypot';
import { CASTLE_CLEAR, DEFAULT_BOARD, laneOf, lanesFrom, type Board } from './board';
import {
  MAX_LEVEL,
  RACES,
  roleOf,
  type Race,
  type UpgradeNeed,
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
export const TIME_LIMIT = 1800;
/** From this time (seconds) a stalemate wears down: every blow a castle takes grows by 1 for every `SUDDEN_DEATH_RAMP` seconds more. */
export const SUDDEN_DEATH = 1080;
export const SUDDEN_DEATH_RAMP = 90;
export const suddenDeath = (time: number) => 1 + Math.max(0, time - SUDDEN_DEATH) / SUDDEN_DEATH_RAMP;
/** Units one side may have alive at once (there is no queue to hold them back, so the rules do). */
export const UNIT_CAP = 120;
/** How far (cells) a castle's body reaches: attackers hit its edge, not its centre. */
export const CASTLE_RADIUS = 1.2;
const TOWER_RADIUS = 0.5;
/** How far (cells) beyond its own reach a melee soldier in a bunker strikes: foes at the walls, not only at its door. */
const BUNKER_GUARD = 3;
/** The farthest (cells, square to the road) a unit will step off it to take a tower down, in the game's own races' scale. */
/** Nothing is built this near (cells) the foe's castle, however far your fog reaches: no tower creep onto their doorstep. */
export const FOE_CLEAR = 24;
export const DETOUR_MAX = 9 * REACH_SCALE;

/** A seat: whose castle, units and towers a thing is. A duel has two (0 and 1); a co-op match up to four, on sides (`Player.team`). */
export type Owner = number;

export interface Unit {
  id: number;
  def: UnitDef;
  owner: Owner;
  hp: number;
  maxHp: number;
  /** Which of the board's lanes it walks (a seat's first when missing: a duel has only one way). */
  lane?: number;
  /** Cells walked from its own castle along its lane (a flyer follows the road too). */
  s: number;
  cooldown: number;
  /** Poison on it: hit points lost a second, for `left` more seconds (`by` is the seat whose poison it is, paid the bounty if it kills). */
  dot?: { dps: number; left: number; by: Owner };
  /** The seat that last hurt it, paid the bounty when it falls. */
  by?: Owner;
  /** Off the road to take a tower down: straight across from the road (`dir`, one axis), `d` cells out, at most `max`. */
  off?: { tower: number; dir: [number, number]; d: number; max: number; leaving?: boolean };
  /** Blew itself up (no bounty for the foe). */
  spent?: boolean;
  /** Sent after one thing by its player: a particular enemy tower, or the castle. It ignores the rest (orders) until that tower falls. */
  focus?: Focus;
  /** Ordered into this bunker (by id): it walks the road to the bunker's door, ignoring the fight, and goes in (`garrisonUnits`). */
  enter?: number;
  /** Went into the bunker it was ordered to: gone from the field this step (no death, no bounty). */
  entered?: boolean;
}

/** What a unit may be sent after: one enemy tower (by id) or an enemy castle (the seat's; none named: the castle its lane ends at). */
export type Focus = { kind: 'tower'; id: number } | { kind: 'castle'; owner?: Owner };

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
  /** Units this building has sent out (a producer; the next purchase leaves from the one that has sent the fewest). */
  spawned?: number;
  /** Health still to be mended by a paid repair (`repairTower`); it comes back over time, not at once. */
  mend?: number;
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
  /** Which side it is on: seats of one team win and lose together. */
  team: number;
  /** The lane the units it buys walk (`setLane`). */
  lane: number;
  /** What the castle and its buildings pay is multiplied by this (1 for everyone but a computer side that stands alone against two). */
  pace: number;
  /** Its castle has fallen: the seat is out, its units and towers gone. */
  out: boolean;
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
  /** Whose it was. */
  owner: Owner;
  def: UnitDef;
  lane?: number;
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
  /** Nothing is built this near (cells) the foe's castle (`FOE_CLEAR` in the game). */
  foeClear: number;
  time: number;
  payTimer: number;
  /** One per seat (at least two). */
  players: [Player, Player, ...Player[]];
  units: Unit[];
  towers: Tower[];
  shots: Shot[];
  deaths: Death[];
  /** Towers destroyed this step. */
  razed: { col: number; row: number }[];
  nextId: number;
  /** -1 still playing, the winning team (0 or 1), or 2 a draw. In a duel the team is the seat. */
  winner: number;
}

/** What a match is played by: the races' numbers, how far a unit steps off the road, how near the foe's castle nothing is built. */
export interface Rules {
  races: Record<RaceId, Race>;
  detourMax: number;
  foeClear: number;
}

/**
 * A new match: one race per seat (the board has as many camps), on the board's sides (`board.teams`; a duel's two seats face each
 * other). `pace` multiplies what a seat earns (the board's own unless given: a computer side that stands alone against two gets more).
 */
export function newMatch(
  races: readonly RaceId[],
  board: Board = DEFAULT_BOARD,
  rules: Rules = { races: RACES, detourMax: DETOUR_MAX, foeClear: FOE_CLEAR },
  pace: readonly number[] = board.pace,
): Match {
  const player = (race: RaceId, seat: number): Player => {
    const hp = rules.races[race].castle.hp;
    return {
      race,
      team: board.teams[seat] ?? seat,
      lane: board.homeLane[seat] ?? 0,
      pace: pace[seat] ?? 1,
      out: false,
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
    players: races.map(player) as Match['players'],
    units: [],
    towers: [],
    shots: [],
    deaths: [],
    razed: [],
    nextId: 1,
    winner: -1,
  };
}

/** The other seat of a duel (use `foesOf` for anything that may be played with more than two). */
export const enemy = (o: Owner): Owner => (o === 0 ? 1 : 0);
export const raceOf = (m: Match, o: Owner) => m.races[m.players[o]!.race];
export const teamOf = (m: Match, o: Owner) => m.players[o]?.team ?? o;
export const allied = (m: Match, a: Owner, b: Owner) => teamOf(m, a) === teamOf(m, b);
/** The seats still in the match that fight `o`: another side's, whose castle stands. */
export const foesOf = (m: Match, o: Owner): Owner[] =>
  m.players.flatMap((p, i) => (p.team !== teamOf(m, o) && !p.out ? [i] : []));
/** The seats on `o`'s side (itself included), in or out. */
export const teamSeats = (m: Match, o: Owner): Owner[] =>
  m.players.flatMap((p, i) => (p.team === teamOf(m, o) ? [i] : []));
/** May this seat still act: the match goes on and its castle stands. */
export const playing = (m: Match, o: Owner) => m.winner < 0 && !!m.players[o]! && !m.players[o].out;

/** Where a unit is, in cells: along its lane from its own castle (a flyer too), and off to the side when it has stepped off the road. */
export function unitPos(u: Pick<Unit, 'owner' | 's' | 'off' | 'lane'>, board: Board = DEFAULT_BOARD): [number, number] {
  const [x, y] = laneOf(board, u).pointAt(u.s);
  return u.off ? [x + u.off.dir[0] * u.off.d, y + u.off.dir[1] * u.off.d] : [x, y];
}

const dist = (a: readonly [number, number], b: readonly [number, number]) => hypot(a[0] - b[0], a[1] - b[1]);
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
  const p = m.players[owner]!;
  const base = raceOf(m, owner).castle.income[p.castle.level - 1]!;
  const out = { ...base };
  for (const t of m.towers)
    if (t.owner === owner && t.hp > 0 && t.def.econ) {
      out.wood += t.def.econ.wood ?? 0;
      out.stone += t.def.econ.stone ?? 0;
    }
  out.wood *= p.pace;
  out.stone *= p.pace;
  return out;
}

// --- Buildings that must stand, and upgrades ---------------------------------------------------------------------------

/** Does `owner` have this building standing? */
export const hasBuilding = (m: Match, owner: Owner, id: string) =>
  m.towers.some((t) => t.owner === owner && t.hp > 0 && t.def.id === id);

/** What the next castle upgrade still asks of the buildings: each unmet need with how many stand now (nothing when all are met). */
export function upgradeLacks(m: Match, owner: Owner): { need: UpgradeNeed; have: number }[] {
  const level = m.players[owner]!.castle.level;
  const needs = raceOf(m, owner).castle.needs[level - 1] ?? [];
  const mine = m.towers.filter((t) => t.owner === owner && t.hp > 0);
  return needs
    .map((need) => ({
      need,
      have: mine.filter((t) => roleOf(t.def) === need.role && t.def.tier >= (need.tier ?? 1)).length,
    }))
    .filter((x) => x.have < x.need.count);
}

/** Can `owner` buy this unit now, apart from the money: the castle level and the building it needs. */
export function unitUnlocked(m: Match, owner: Owner, def: UnitDef): 'ok' | 'tier' | 'needs' {
  if (def.tier > m.players[owner]!.castle.level) return 'tier';
  if (def.needs && !hasBuilding(m, owner, def.needs)) return 'needs';
  return 'ok';
}

/** Can `owner` build this kind of building now, apart from where and the money: the castle level, the building it needs, its limit. */
export function towerUnlocked(m: Match, owner: Owner, def: TowerDef): 'ok' | 'tier' | 'needs' | 'limit' {
  if (def.tier > m.players[owner]!.castle.level) return 'tier';
  if (def.needs && !hasBuilding(m, owner, def.needs)) return 'needs';
  if (def.limit !== undefined && m.towers.filter((t) => t.owner === owner && t.def.id === def.id).length >= def.limit)
    return 'limit';
  return 'ok';
}

/** The levels `owner` has bought of an upgrade line. */
export const upgradeLevel = (m: Match, owner: Owner, id: string) => m.players[owner]!.upgrades[id] ?? 0;

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
  if (!playing(m, owner)) return 'over';
  const up = raceOf(m, owner).upgrades.find((u) => u.id === id);
  if (!up) return 'unknown';
  const next = nextUpgrade(m, owner, up);
  if (!next) return 'max';
  const p = m.players[owner]!;
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
  if (!u.def.cloak || allied(m, u.owner, viewer)) return true;
  const at = unitPos(u, m.board);
  for (const seat of teamSeats(m, viewer))
    if (dist(at, m.board.castles[seat]!) <= raceOf(m, seat).castle.detect + CASTLE_RADIUS) return true;
  return m.towers.some(
    (t) =>
      allied(m, t.owner, viewer) && t.def.detect !== undefined && t.hp > 0 && dist(at, centreOf(t)) <= t.def.detect,
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
  /** Whose it is (an ally's circles are shared with its side, but only a seat builds on its own ground). */
  owner: Owner;
  x: number;
  y: number;
  r: number;
  /** Part of the build area (permanent ground you may build on). */
  build: boolean;
  /** Given by a unit: gone when it dies or walks on. */
  temporary: boolean;
}

/** Everything each seat sees through its own things, by seat (compute once per step or frame with `visionOf`, then ask `canSee`). A seat sees through its allies' things too: see `canSee`. */
export type Vision = readonly (readonly Sight[])[];

/** The circles `owner` sees through now. */
export function sightOf(m: Match, owner: Owner): Sight[] {
  const castle = raceOf(m, owner).castle;
  const [cx, cy] = m.board.castles[owner]!;
  const out: Sight[] = [
    { key: `c${owner}:build`, owner, x: cx, y: cy, r: buildReach(m, owner), build: true, temporary: false },
    { key: `c${owner}:sight`, owner, x: cx, y: cy, r: castle.sight, build: true, temporary: false },
  ];
  for (const t of m.towers) {
    if (t.owner !== owner || t.hp <= 0) continue;
    const [x, y] = centreOf(t);
    out.push({ key: `t${t.id}:sight`, owner, x, y, r: t.def.sight, build: true, temporary: false });
    if (t.def.reach > 0)
      out.push({ key: `t${t.id}:build`, owner, x, y, r: t.def.reach, build: true, temporary: false });
  }
  for (const u of m.units) {
    if (u.owner !== owner || u.hp <= 0) continue;
    const [x, y] = unitPos(u, m.board);
    out.push({ key: `u${u.id}`, owner, x, y, r: u.def.sight, build: false, temporary: true });
  }
  return out;
}

export const visionOf = (m: Match): Vision => m.players.map((p, o) => (p.out ? [] : sightOf(m, o)));

/** Every circle `viewer` sees through: its own and its allies' (a side shares what it sees). */
export const sightsFor = (m: Match, viewer: Owner, vision: Vision = visionOf(m)): Sight[] =>
  teamSeats(m, viewer).flatMap((o) => vision[o] ?? []);

/** Can `viewer` see this point (cells)? `pad` widens every circle (a body has a size: see a tower or castle by its edge). */
export function canSee(m: Match, viewer: Owner, at: readonly [number, number], pad = 0, vision = visionOf(m)): boolean {
  for (const o of teamSeats(m, viewer))
    for (const s of vision[o] ?? []) if (hypot(at[0] - s.x, at[1] - s.y) <= s.r + pad) return true;
  return false;
}

/** Can `viewer` see this unit: its side's always; another's when it is in sight and, if cloaked, detected too. */
export function isSeen(m: Match, viewer: Owner, e: Unit | Tower, vision = visionOf(m)): boolean {
  if (allied(m, e.owner, viewer)) return true;
  if ('col' in e) return canSee(m, viewer, centreOf(e), TOWER_RADIUS, vision);
  return canSee(m, viewer, unitPos(e, m.board), 0, vision) && visibleTo(m, e, viewer);
}

/** Can `viewer` see `owner`'s castle? Their own always. */
export function isCastleSeen(m: Match, viewer: Owner, owner: Owner, vision = visionOf(m)): boolean {
  return allied(m, owner, viewer) || canSee(m, viewer, m.board.castles[owner]!, CASTLE_RADIUS, vision);
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
  if (!playing(m, owner)) return 'over';
  const p = m.players[owner]!;
  const lane = laneFor(m, owner);
  if (lane === undefined) return 'over'; // no foe left to walk to
  const def = raceOf(m, owner).units.find((u) => u.id === unitId);
  if (!def) return 'unknown';
  const open = unitUnlocked(m, owner, def);
  if (open !== 'ok') return open;
  if (m.units.reduce((n, u) => n + (u.owner === owner ? 1 : 0), 0) + def.count > UNIT_CAP) return 'cap';
  if (!canAfford(p, def.cost)) return 'gold';
  pay(p, def.cost);
  const maxHp = def.hp * boostOf(m, owner, def, 'hp');
  const spot = spawnPoint(m, owner, def, lane);
  // Units that walk out together are spread along the first stretch of road (a crowd bought at once is not one stack on one spot);
  // from a building they file out of its door instead (`exitFrom`).
  const queued = spot.out
    ? 0
    : m.units.reduce(
        (n, u) =>
          n + (u.owner === owner && (u.lane ?? lane) === spot.lane && u.s >= spot.s && u.s < spot.s + SPREAD ? 1 : 0),
        0,
      );
  for (let i = 0; i < def.count; i++)
    m.units.push({
      id: m.nextId++,
      def,
      owner,
      lane: spot.lane,
      hp: maxHp,
      maxHp,
      ...exitFrom(spot, i, queued),
      cooldown: 0,
    });
  return 'ok';
}

/**
 * Where a purchase of `def` walks out: from the producer building that unlocks it (the one that has sent the fewest, so several
 * share the work), at the road point straight across from it (the nearest open lane), else from the castle.
 */
function spawnPoint(m: Match, owner: Owner, def: UnitDef, home: number): Spot {
  let from: Tower | undefined;
  for (const t of m.towers)
    if (t.owner === owner && t.hp > 0 && def.needs !== undefined && t.def.id === def.needs)
      if (!from || (t.spawned ?? 0) < (from.spawned ?? 0)) from = t;
  if (!from) return { lane: home, s: 0 };
  from.spawned = (from.spawned ?? 0) + 1;
  return roadPointBy(m, owner, from, home);
}

/** Where new units appear: a point on a lane, and for a building the door they walk out of (square to the road, `d` from it). */
interface Spot {
  lane: number;
  s: number;
  out?: { tower: number; dir: [number, number]; d: number };
}

/**
 * The road point straight across from a building (on the nearest open lane), with the door it walks out of, or the castle when
 * it has none. The unit starts at the building's edge and walks square to the road, as it does to take the building down.
 */
function roadPointBy(m: Match, owner: Owner, t: Tower, home: number): Spot {
  let best: { lane: number; s: number; d: number; dir: [number, number] } | undefined;
  for (const l of openLanes(m, owner)) {
    const foot = l.footOf(t.col, t.row);
    if (foot && (!best || foot.d < best.d)) best = { lane: l.id, s: foot.s, d: foot.d, dir: foot.dir };
  }
  if (!best) return { lane: home, s: 0 };
  return { lane: best.lane, s: best.s, out: { tower: t.id, dir: best.dir, d: Math.max(0, best.d - TOWER_RADIUS) } };
}

/**
 * Where the i-th unit out of a spot starts: from a building it files out of its door (`off`, leaving: it walks square to the road
 * and joins it at the spot's point); otherwise on the road, `queued` units already there pushed along it.
 */
function exitFrom(spot: Spot, i: number, queued: number): Pick<Unit, 's' | 'off'> {
  if (!spot.out) return { s: spot.s + Math.min(SPREAD, i * SPACING + queued * SPACING) };
  const d = spot.out.d + i * SPACING;
  return { s: spot.s, off: { ...spot.out, d, max: d, leaving: true } };
}

/** The lanes `owner`'s units may walk now: those that end at the castle of a foe still standing. */
export const openLanes = (m: Match, owner: Owner) =>
  lanesFrom(m.board, owner).filter((l) => !m.players[l.to]!.out && !allied(m, owner, l.to));

/** The lane new units of `owner` take: the one it picked (`setLane`) while it still leads to a foe, else the first that does. */
export function laneFor(m: Match, owner: Owner): number | undefined {
  const open = openLanes(m, owner);
  const want = m.players[owner]!.lane;
  return (open.find((l) => l.id === want) ?? open[0])?.id;
}

/** Choose the lane the units `owner` buys from now on walk (a road that forks: which way). */
export function setLane(m: Match, owner: Owner, lane: number): Result {
  if (!playing(m, owner)) return 'over';
  if (!openLanes(m, owner).some((l) => l.id === lane)) return 'unknown';
  m.players[owner]!.lane = lane;
  return 'ok';
}

/** How many purchases of this unit `owner` can make right now: limited by wood, stone, the unit cap and what the castle and buildings unlock. */
export function maxPurchases(m: Match, owner: Owner, def: UnitDef): number {
  if (!playing(m, owner) || unitUnlocked(m, owner, def) !== 'ok') return 0;
  const p = m.players[owner]!;
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
  if (!playing(m, owner)) return 'over';
  const t = m.towers.find((x) => x.id === towerId && x.owner === owner && x.hp > 0);
  const def = raceOf(m, owner).units.find((u) => u.id === unitId);
  if (!t || !def) return 'unknown';
  if (!t.def.bunker || !def.garrison) return 'nobunker';
  const open = unitUnlocked(m, owner, def);
  if (open !== 'ok') return open;
  if (t.garrison.length >= t.def.bunker.slots) return 'full';
  const p = m.players[owner]!;
  const cost = soldierCost(def);
  if (!canAfford(p, cost)) return 'gold';
  pay(p, cost);
  t.garrison.push({ def, cooldown: 0 });
  return 'ok';
}

/**
 * Order these units (ids, `owner`'s own) into one of their bunkers: each garrison-capable unit, while a slot is free (counting the ones
 * already on their way), walks the road to the bunker's door, however far (back too), and shoots from inside it (it keeps what it was
 * bought for; nothing is paid). How many were sent.
 */
export function garrisonUnits(m: Match, owner: Owner, towerId: number, unitIds: readonly number[]): number {
  if (!playing(m, owner)) return 0;
  const t = m.towers.find((x) => x.id === towerId && x.owner === owner && x.hp > 0);
  if (!t?.def.bunker) return 0;
  let free = t.def.bunker.slots - t.garrison.length - m.units.filter((u) => u.enter === t.id && u.hp > 0).length;
  let sent = 0;
  for (const id of unitIds) {
    if (free <= 0) break;
    const u = m.units.find((x) => x.id === id && x.owner === owner && x.hp > 0 && !x.spent && x.def.garrison);
    if (!u || u.enter === t.id) continue;
    u.enter = t.id;
    delete u.focus;
    free--;
    sent++;
  }
  return sent;
}

/** One step of a unit ordered into a bunker: back off the road if it stepped off, walk to the door, go in. False when the order is void. */
function marchIn(m: Match, u: Unit, dt: number): boolean {
  const t = m.towers.find((x) => x.id === u.enter && x.owner === u.owner && x.hp > 0 && x.def.bunker);
  const foot = t && laneOf(m.board, u).footOf(t.col, t.row);
  if (!t || !foot || t.garrison.length >= t.def.bunker!.slots) return false;
  if (u.off) {
    u.off.d -= u.def.speed * dt;
    if (u.off.d <= 0) delete u.off;
    return true;
  }
  const gap = foot.s - u.s;
  if (Math.abs(gap) > u.def.speed * dt) u.s += Math.sign(gap) * u.def.speed * dt;
  else {
    u.s = foot.s;
    t.garrison.push({ def: u.def, cooldown: 0 });
    u.entered = true;
  }
  return true;
}

/** Tell all of a player's units to fight what they meet (`attack`) or walk on past it (`bypass`): `what` is towers or units. */
export function setOrder(m: Match, owner: Owner, what: keyof Orders, to: Orders[keyof Orders]): void {
  if (playing(m, owner)) m.players[owner]!.orders[what] = to;
}

/** Can a unit of this kind take this tower down: from the road with its range, or by stepping off it (at most `Match.detourMax` cells)? */
export function canTarget(
  m: Match,
  unit: Pick<Unit, 'owner' | 'lane'> & { def: Pick<UnitDef, 'range'> },
  t: Tower,
): boolean {
  const { def } = unit;
  const foot = laneOf(m.board, unit).footOf(t.col, t.row);
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
  if (!playing(m, owner)) return 'over';
  const mine = m.units.filter((u) => u.owner === owner && unitIds.includes(u.id) && !u.spent);
  if (focus?.kind === 'tower') {
    const t = m.towers.find((x) => x.id === focus.id && !allied(m, x.owner, owner) && x.hp > 0);
    if (!t) return 'unknown';
    if (!mine.some((u) => canTarget(m, u, t))) return 'unreachable';
    for (const u of mine) if (canTarget(m, u, t)) u.focus = focus;
    return 'ok';
  }
  if (focus?.kind === 'castle' && focus.owner !== undefined) {
    const seat = focus.owner;
    if (!m.players[seat]! || m.players[seat].out || allied(m, seat, owner)) return 'unknown';
    // Units that are not on a road to that castle cross to one, where the roads meet (a fork or a crossing within reach).
    const lane = lanesFrom(m.board, owner).find((l) => l.to === seat);
    const sent = mine.filter((u) => laneOf(m.board, u).to === seat || (lane && switchLane(m, u, lane.id, SWITCH_NEAR)));
    if (!sent.length) return 'unreachable';
    for (const u of sent) u.focus = focus;
    return 'ok';
  }
  for (const u of mine) {
    if (focus) u.focus = focus;
    else delete u.focus;
  }
  return 'ok';
}

/** How near (cells) a unit must be to another lane to be sent along it: only where the roads meet. */
export const SWITCH_NEAR = 4;

/**
 * Put a unit on another lane, at the point of it nearest where the unit stands (it must be within `near` cells of it).
 * False when it is too far: nothing changes.
 */
export function switchLane(m: Match, u: Unit, laneId: number, near = Infinity): boolean {
  const spot = nearestOnLane(m, u, laneId);
  if (!spot || spot.d > near) return false;
  u.lane = laneId;
  u.s = spot.s;
  delete u.off;
  return true;
}

/** Where on a lane (of the unit's own seat) the unit stands nearest to, and how far off: nothing for a lane that is not its seat's. */
export function nearestOnLane(m: Match, u: Unit, laneId: number): { s: number; d: number } | undefined {
  const lane = m.board.lanes[laneId];
  if (!lane || lane.from !== u.owner) return undefined;
  const at = unitPos(u, m.board);
  let best = { s: 0, d: Infinity };
  for (let s = 0; s <= lane.length; s += 0.5) {
    const d = dist(at, lane.pointAt(s));
    if (d < best.d) best = { s, d };
  }
  return best;
}

/**
 * Turn these units (ids, `owner`'s own) onto another road, the way to steer an army before a fork: only a unit still on a stretch the
 * two roads share (within `SWITCH_NEAR`) can take it, the rest walk on. 'unreachable' when none can.
 */
export function setRoute(m: Match, owner: Owner, unitIds: readonly number[], laneId: number): Result | 'unreachable' {
  if (!playing(m, owner)) return 'over';
  if (!openLanes(m, owner).some((l) => l.id === laneId)) return 'unknown';
  let moved = 0;
  for (const u of m.units)
    if (u.owner === owner && unitIds.includes(u.id) && !u.spent && switchLane(m, u, laneId, SWITCH_NEAR)) {
      moved++;
      if (u.focus?.kind === 'castle' && (u.focus.owner ?? m.board.lanes[laneId]!.to) !== m.board.lanes[laneId]!.to)
        delete u.focus;
    }
  return moved ? 'ok' : 'unreachable';
}

/** What it costs to take the castle up a level, or undefined at the top. */
export function upgradeCost(m: Match, owner: Owner): Cost | undefined {
  return raceOf(m, owner).castle.upgrades[m.players[owner]!.castle.level - 1];
}

/** Raise the castle a level: more build reach, income and hit points, and the next tier of units and towers. */
export function upgradeCastle(m: Match, owner: Owner): Result {
  if (!playing(m, owner)) return 'over';
  const p = m.players[owner]!;
  const cost = upgradeCost(m, owner);
  if (p.castle.level >= MAX_LEVEL || cost === undefined) return 'max';
  if (upgradeLacks(m, owner).length > 0) return 'needs';
  if (!canAfford(p, cost)) return 'gold';
  pay(p, cost);
  p.castle.level++;
  const extra = raceOf(m, owner).castle.hpPerLevel;
  p.castle.maxHp += extra;
  p.castle.hp += extra;
  return 'ok';
}

/** Cells around the castle where towers may be built now. */
export const buildReach = (m: Match, owner: Owner) =>
  raceOf(m, owner).castle.reach[m.players[owner]!.castle.level - 1]!;

export const towerAt = (m: Match, col: number, row: number) => m.towers.find((t) => t.col === col && t.row === row);

/** Is this cell inside the area `owner` may build in: ground their castle or a standing tower sees (or reaches, if that is farther)? Units never add to it. */
export function inBuildArea(m: Match, owner: Owner, col: number, row: number): boolean {
  const c: [number, number] = [col + 0.5, row + 0.5];
  const castle = m.board.castles[owner]!;
  if (dist(c, castle) <= Math.max(buildReach(m, owner), raceOf(m, owner).castle.sight)) return true;
  return m.towers.some(
    (t) => t.owner === owner && t.hp > 0 && dist(c, centreOf(t)) <= Math.max(t.def.reach, t.def.sight),
  );
}

export type BuildResult = Result | 'off-board' | 'road' | 'scenery' | 'taken' | 'castle' | 'foe' | 'area';

export function canBuild(m: Match, owner: Owner, def: TowerDef, col: number, row: number): BuildResult {
  if (!playing(m, owner)) return 'over';
  const b = m.board;
  if (!b.inBoard(col, row)) return 'off-board';
  if (b.roadCells.has(b.cellIndex(col, row))) return 'road';
  if (b.sceneryCells.has(b.cellIndex(col, row))) return 'scenery';
  const c: [number, number] = [col + 0.5, row + 0.5];
  if (b.castles.some((k) => dist(c, k) < CASTLE_CLEAR)) return 'castle';
  if (foesOf(m, owner).some((o) => dist(c, b.castles[o]!) < m.foeClear)) return 'foe';
  if (towerAt(m, col, row)) return 'taken';
  const open = towerUnlocked(m, owner, def);
  if (open !== 'ok') return open;
  if (!inBuildArea(m, owner, col, row)) return 'area';
  if (!canAfford(m.players[owner]!, def.cost)) return 'gold';
  return 'ok';
}

export function buildTower(m: Match, owner: Owner, towerId: string, col: number, row: number): BuildResult {
  const def = raceOf(m, owner).towers.find((t) => t.id === towerId);
  if (!def) return 'unknown';
  const why = canBuild(m, owner, def, col, row);
  if (why !== 'ok') return why;
  pay(m.players[owner]!, def.cost);
  m.towers.push({ id: m.nextId++, def, owner, col, row, hp: def.hp, cooldown: 0, garrison: [] });
  return 'ok';
}

/** Repairing a tower costs this share of its price, scaled by the health it is missing; the mending takes `REPAIR_TIME`. */
export const REPAIR_SHARE = 0.5;
export const REPAIR_TIME = 20;

/** Health a repair would still have to cover (what is missing and not already being mended). */
export const repairable = (t: Tower) => Math.max(0, t.def.hp - t.hp - (t.mend ?? 0));

/** What repairing `t` costs now: a share of its price in proportion to the health it lacks. */
export function repairCost(t: Tower): Cost {
  const k = (REPAIR_SHARE * repairable(t)) / t.def.hp;
  return price(Math.ceil(t.def.cost.wood * k), Math.ceil(t.def.cost.stone * k));
}

/** Pay to mend a damaged tower of `owner`'s: it heals over `REPAIR_TIME` seconds (and may fall before it is done). */
export function repairTower(m: Match, owner: Owner, towerId: number): Result {
  if (!playing(m, owner)) return 'over';
  const t = m.towers.find((x) => x.id === towerId && x.owner === owner && x.hp > 0);
  if (!t) return 'unknown';
  if (repairable(t) < 1) return 'max';
  const cost = repairCost(t);
  if (!canAfford(m.players[owner]!, cost)) return 'gold';
  pay(m.players[owner]!, cost);
  t.mend = (t.mend ?? 0) + repairable(t);
  return 'ok';
}

/** Selling a standing tower of yours returns this share of its price (a bunker's soldiers are lost) and frees its ground. */
export const SELL_SHARE = 0.5;

/** What selling `t` pays back. */
export const sellRefund = (t: Tower): Cost =>
  price(Math.floor(t.def.cost.wood * SELL_SHARE), Math.floor(t.def.cost.stone * SELL_SHARE));

/** Sell a tower of `owner`'s: it goes at once (like a razed one, so what it unlocked locks again) and pays `sellRefund`. */
export function sellTower(m: Match, owner: Owner, towerId: number): Result {
  if (!playing(m, owner)) return 'over';
  const t = m.towers.find((x) => x.id === towerId && x.owner === owner && x.hp > 0);
  if (!t) return 'unknown';
  earn(m.players[owner]!, sellRefund(t));
  m.towers = m.towers.filter((x) => x !== t);
  // The soldiers inside come out onto the road beside it and march on (they were bought already: the unit cap does not stop them).
  const home = laneFor(m, owner);
  if (home !== undefined) {
    const spot = roadPointBy(m, owner, t, home);
    t.garrison.forEach((g, i) => {
      const maxHp = g.def.hp * boostOf(m, owner, g.def, 'hp');
      m.units.push({
        id: m.nextId++,
        def: g.def,
        owner,
        lane: spot.lane,
        hp: maxHp,
        maxHp,
        ...exitFrom(spot, i, 0),
        cooldown: 0,
      });
    });
  }
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
  /** Fight only this seat's castle among the castles (a unit sent after it). */
  onlyCastle?: Owner;
}

/** Could it hit this kind of unit at all (a cheap test, before distance and sight are asked)? */
const hittable = (m: Match, r: Pick<Reach, 'owner' | 'ground' | 'air'>, u: Unit) =>
  !allied(m, u.owner, r.owner) && u.hp > 0 && (u.def.air ? r.air : r.ground);
const canHit = (m: Match, r: Pick<Reach, 'owner' | 'ground' | 'air' | 'vision'>, u: Unit) =>
  hittable(m, r, u) && isSeen(m, r.owner, u, r.vision);

/** The nearest thing the attacker can hit within its range. */
function pick(m: Match, r: Reach): Target | undefined {
  let best: Target | undefined;
  let bestDist = Infinity;
  for (const u of r.units ? m.units : []) {
    if (!hittable(m, r, u)) continue;
    const d = dist(r.from, unitPos(u, m.board));
    if (d <= r.range && d < bestDist && isSeen(m, r.owner, u, r.vision)) {
      best = { kind: 'unit', unit: u };
      bestDist = d;
    }
  }
  for (const t of r.towers ? m.towers : []) {
    if (allied(m, t.owner, r.owner) || t.hp <= 0 || (r.only !== undefined && t.id !== r.only)) continue;
    const d = dist(r.from, centreOf(t)) - TOWER_RADIUS;
    if (d <= r.range && d < bestDist && isSeen(m, r.owner, t, r.vision)) {
      best = { kind: 'tower', tower: t };
      bestDist = d;
    }
  }
  if (r.castle)
    for (const foe of foesOf(m, r.owner)) {
      if (r.onlyCastle !== undefined && foe !== r.onlyCastle) continue;
      const d = dist(r.from, m.board.castles[foe]!) - CASTLE_RADIUS;
      if (m.players[foe]!.castle.hp > 0 && d <= r.range && d < bestDist && isCastleSeen(m, r.owner, foe, r.vision)) {
        best = { kind: 'castle', owner: foe };
        bestDist = d;
      }
    }
  return best;
}

const targetPoint = (m: Match, t: Target): [number, number] =>
  t.kind === 'unit' ? unitPos(t.unit, m.board) : t.kind === 'tower' ? centreOf(t.tower) : m.board.castles[t.owner]!;

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
    u.by = r.owner;
    if (blow.dot) u.dot = { dps: blow.dot.dps, left: blow.dot.seconds, by: r.owner };
  };
  m.shots.push({ by: r.by, from: [...r.from], to: at, melee: blow.melee, splash: blow.splash });
  if (t.kind === 'unit') burn(t.unit);
  else if (t.kind === 'tower') t.tower.hp -= blow.damage * blow.siege;
  else m.players[t.owner]!.castle.hp -= blow.damage * blow.siege * suddenDeath(m.time);
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
        hittable(m, r, u) &&
        !(t.kind === 'unit' && u === t.unit) &&
        dist(at, unitPos(u, m.board)) <= blow.splash &&
        canHit(m, r, u)
      )
        burn(u);
    if (r.towers)
      for (const o of m.towers)
        if (
          !allied(m, o.owner, r.owner) &&
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
    if (allied(m, t.owner, u.owner) || t.hp <= 0 || (only !== undefined && t.id !== only)) continue;
    const foot = laneOf(m.board, u).footOf(t.col, t.row);
    if (!foot || foot.d > m.detourMax || foot.d - TOWER_RADIUS <= u.def.range) continue;
    const s = foot.s;
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
    m.players.forEach((p, o) => {
      if (!p.out) earn(p, incomeOf(m, o));
    });
  }

  // Poison burns, and healing auras mend.
  for (const u of m.units) {
    if (!u.dot) continue;
    u.hp -= u.dot.dps * dt;
    if (u.hp <= 0) u.by = u.dot.by;
    u.dot.left -= dt;
    if (u.dot.left <= 0) delete u.dot;
  }
  for (const t of m.towers) {
    if (t.mend && t.hp > 0) {
      const add = Math.min(t.mend, (t.def.hp / REPAIR_TIME) * dt, t.def.hp - t.hp);
      t.hp += add;
      t.mend = add < t.mend && t.hp < t.def.hp ? t.mend - add : undefined;
    }
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
    const k = m.players[t.owner]!.castle;
    if (k.hp > 0 && dist(c, m.board.castles[t.owner]!) <= aura.radius + CASTLE_RADIUS)
      k.hp = Math.min(k.maxHp, k.hp + mend);
  }

  // What each side sees this step (units that spawned count; those about to die still do until the step ends).
  const vision = visionOf(m);

  // Units fight what is in reach, or walk on (stepping off the road to take a tower it cannot otherwise reach).
  for (const u of m.units) {
    if (u.spent || u.entered) continue;
    if (u.enter !== undefined) {
      if (marchIn(m, u, dt)) continue;
      delete u.enter;
    }
    u.cooldown -= dt;
    const from = unitPos(u, m.board);
    const orders = m.players[u.owner]!.orders;
    const lane = laneOf(m.board, u);
    const goal = lane.length - CASTLE_RADIUS;
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
      onlyCastle: u.focus?.kind === 'castle' ? (u.focus.owner ?? lane.to) : undefined,
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
      const wanted = !off.leaving && tower !== undefined && tower.hp > 0 && towersOn;
      off.d = Math.min(off.max, off.d + (wanted ? 1 : -1) * u.def.speed * dt);
      if (off.d <= 0) delete u.off;
    } else {
      const next = Math.min(goal, u.s + u.def.speed * dt);
      const tower = towersOn ? detourFor(m, u, vision, next, sentAt?.id) : undefined;
      if (sentAt && next >= goal - 1e-6 && !tower) delete u.focus; // walked the road and never got at it
      if (tower) {
        const foot = lane.footOf(tower.col, tower.row)!;
        u.s = foot.s;
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
    // A bunker's soldiers fight on their own cooldowns, each as its kind of unit does: shooters a little further from the walls, melee ones at foes near them.
    for (const g of t.garrison) {
      g.cooldown -= dt;
      if (g.cooldown > 0) continue;
      const reach: Reach = {
        owner: t.owner,
        by: { kind: 'tower', id: t.id },
        vision,
        from,
        range: g.def.range + (t.def.bunker?.rangeBonus ?? 0) + (g.def.range <= 1.5 ? BUNKER_GUARD : 0),
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
  for (const [o, p] of m.players.entries()) {
    if (p.out) continue;
    const c = p.castle;
    c.cooldown -= dt;
    if (c.cooldown > 0) continue;
    const def = raceOf(m, o).castle;
    const reach: Reach = {
      owner: o,
      by: { kind: 'castle', id: o },
      vision,
      from: m.board.castles[o]!,
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
    if (u.entered) return false;
    if (u.hp > 0) return true;
    m.deaths.push({
      at: unitPos(u, m.board),
      owner: u.owner,
      def: u.def,
      lane: u.lane,
      s: u.s,
      ...(u.spent && u.def.splash ? { boom: u.def.splash } : {}),
    });
    // The seat whose blow (or poison) finished it is paid; with nobody to name, the first foe still in.
    const payee = u.by !== undefined && !allied(m, u.by, u.owner) ? u.by : foesOf(m, u.owner)[0];
    if (!u.spent && payee !== undefined) earn(m.players[payee]!, bounty(u.def));
    return false;
  });
  m.towers = m.towers.filter((t) => {
    if (t.hp > 0) return true;
    m.razed.push({ col: t.col, row: t.row });
    return false;
  });

  // A castle that fell takes its seat out; the match ends when a whole side is out (or, at the time limit, on castle hit points left).
  for (const p of m.players) if (!p.out && p.castle.hp <= 0) p.out = true;
  const sides = [...new Set(m.players.filter((p) => !p.out).map((p) => p.team))];
  if (sides.length === 0) m.winner = 2;
  else if (sides.length === 1) m.winner = sides[0]!;
  else if (m.time >= TIME_LIMIT) {
    const share = (team: number) => {
      const mine = m.players.filter((p) => p.team === team);
      return mine.reduce((n, p) => n + Math.max(0, p.castle.hp), 0) / mine.reduce((n, p) => n + p.castle.maxHp, 0);
    };
    const [x, y] = [share(sides[0]!), share(sides[1]!)];
    m.winner = x === y ? 2 : x > y ? sides[0]! : sides[1]!;
  }
  if (m.winner < 0) dropOut(m);
}

/** What goes with a seat that is out: its units and buildings, and the foes' units that were walking to its castle turn to another. */
function dropOut(m: Match) {
  const out = (o: Owner) => m.players[o]!.out;
  if (!m.units.some((u) => out(u.owner) || out(laneOf(m.board, u).to)) && !m.towers.some((t) => out(t.owner))) return;
  m.towers = m.towers.filter((t) => {
    if (!out(t.owner)) return true;
    m.razed.push({ col: t.col, row: t.row });
    return false;
  });
  m.units = m.units.filter((u) => !out(u.owner));
  for (const u of m.units) {
    if (!out(laneOf(m.board, u).to)) continue;
    // To the open lane nearest where it stands (the roads meet near each camp and at the crossings, so the step is short).
    let best: { id: number; d: number } | undefined;
    const at = unitPos(u, m.board);
    for (const l of openLanes(m, u.owner)) {
      let d = Infinity;
      for (let s = 0; s <= l.length; s += 1) d = Math.min(d, dist(at, l.pointAt(s)));
      if (!best || d < best.d) best = { id: l.id, d };
    }
    if (best) switchLane(m, u, best.id);
    if (u.focus?.kind === 'castle') delete u.focus;
  }
}
