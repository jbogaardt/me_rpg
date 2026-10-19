// Helpers the unit tests share: put things on the board without paying or the build rules, and let time pass.

import { makeBoard } from './board';
import { DRAWN_RACES, type RaceId } from './races';
import { DRAWN_COLS, DRAWN_ROWS, DRAWN_SWITCHBACK } from './road';
import {
  newMatch as newGameMatch,
  step,
  unitPos as gameUnitPos,
  type Match,
  type Owner,
  type Tower,
  type Unit,
} from './sim';

// The unit tests play the races as they are written down (`DRAWN_RACES`) on the field they were drawn for: the classic switchback at
// 36 x 55 cells with no scenery. The game itself plays both stretched (`REACH_SCALE`, `GROW`), which the tests of the data check.
/** The tables as written, with no building asked for a castle upgrade (the tests of the rules that are not about that upgrade just buy it). */
export const RACES = Object.fromEntries(
  Object.entries(DRAWN_RACES).map(([id, race]) => [id, { ...race, castle: { ...race.castle, needs: [[], []] } }]),
) as unknown as typeof DRAWN_RACES;
export const CLASSIC = makeBoard({
  id: 'classic',
  cols: DRAWN_COLS,
  rows: DRAWN_ROWS,
  waypoints: [],
  points: DRAWN_SWITCHBACK,
  halfWidth: 1,
  scenery: [],
});
export const [COLS, ROWS] = [CLASSIC.cols, CLASSIC.rows];
export const { roadLength: ROAD_LENGTH, pointAt, castles: CASTLES, cellIndex } = CLASSIC;
export const ROAD_CELLS = CLASSIC.roadCells;
export const SCENERY_CELLS = CLASSIC.sceneryCells;
export const DEFAULT_BOARD = CLASSIC;
/** A match on the classic field with the races as written. */
export const newMatch = (races: [RaceId, RaceId], board = CLASSIC): Match =>
  newGameMatch(races, board, { races: RACES, detourMax: 9, foeClear: 0 });

/** Where a unit is on the classic field. */
export const unitPos = (u: Parameters<typeof gameUnitPos>[0]) => gameUnitPos(u, CLASSIC);

export const unitDef = (race: RaceId, id: string) => RACES[race].units.find((u) => u.id === id)!;
export const towerDef = (race: RaceId, id: string) => RACES[race].towers.find((t) => t.id === id)!;

/** Put a tower on the board without paying or the build rules (tests place things where they need them). */
export function put(m: Match, owner: Owner, race: RaceId, id: string, col: number, row: number): Tower {
  const def = towerDef(race, id);
  const t: Tower = { id: m.nextId++, def, owner, col, row, hp: def.hp, cooldown: 0, garrison: [] };
  m.towers.push(t);
  return t;
}

/** Put a unit on the road (`s` cells from its own castle) without buying it. `hold` makes it stand still and hold its fire. */
export function spawn(m: Match, owner: Owner, race: RaceId, id: string, s: number, over: Partial<Unit> = {}): Unit {
  const def = unitDef(race, id);
  const u: Unit = { id: m.nextId++, def, owner, hp: def.hp, maxHp: def.hp, s, cooldown: 0, ...over };
  m.units.push(u);
  return u;
}

/** A unit that stands where it is put and cannot be hurt to death: `damageTaken` says what hit it. */
export function dummy(m: Match, owner: Owner, race: RaceId, id: string, s: number): Unit {
  const u = spawn(m, owner, race, id, s, { hp: 100_000, maxHp: 100_000, cooldown: 999 });
  u.def = { ...u.def, speed: 0 };
  return u;
}
export const damageTaken = (u: Unit) => 100_000 - u.hp;

/** Castles that do not shoot, so a test sees only what it is about. */
export function quiet(m: Match): Match {
  for (const p of m.players) p.castle.cooldown = 1e9;
  return m;
}

export function run(m: Match, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) step(m, 1 / 20);
}

/** The `s` of `owner`'s unit that stands on the road nearest to a point: for putting a unit right beside something. */
export function sNear(owner: Owner, at: readonly [number, number]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let s = 0; s <= ROAD_LENGTH; s += 0.05) {
    const [x, y] = pointAt(owner === 0 ? s : ROAD_LENGTH - s);
    const d = Math.hypot(x - at[0], y - at[1]);
    if (d < bestDist) [best, bestDist] = [s, d];
  }
  return best;
}
