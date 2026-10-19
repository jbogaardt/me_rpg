// Helpers the unit tests share: put things on the board without paying or the build rules, and let time pass.

import { ROAD_LENGTH, pointAt } from './board';
import { RACES, type RaceId } from './races';
import { step, type Match, type Owner, type Tower, type Unit } from './sim';

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
