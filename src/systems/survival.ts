import type { Hero } from './combat';

// Food and water: two bars that drain as time passes, like HP and MP but slowly going the other way. Eating and
// drinking (items with `use.food` / `use.water`, see inventory.ts `useFromPack`) fills them. Pixi-free; the
// simulation (host and solo only) calls `tickVitals`, a guest is sent the numbers.

export const MAX_VITAL = 100;
/** Per second: a full bar of food lasts 15 minutes, water 10. */
export const FOOD_DRAIN = MAX_VITAL / 900;
export const WATER_DRAIN = MAX_VITAL / 600;
/** At or below this the hero is "weak": natural HP regeneration stops (and the bar turns warning-red). */
export const LOW_VITAL = 25;
/** HP lost per second for each bar that is empty. It never kills: the hero is left on 1 HP. */
export const STARVE_DAMAGE = 0.4;

/** Is either bar low enough to stop the slow natural healing? */
export function isWeak(hero: Hero): boolean {
  const s = hero.stats;
  return s.food <= LOW_VITAL || s.water <= LOW_VITAL;
}

/** How many bars are empty (0, 1 or 2). */
export function emptyCount(hero: Hero): number {
  const s = hero.stats;
  return (s.food <= 0 ? 1 : 0) + (s.water <= 0 ? 1 : 0);
}

/** Drain both bars for `dt` seconds, and sap HP for each one that is empty (never below 1). */
export function tickVitals(hero: Hero, dt: number) {
  const s = hero.stats;
  s.food = Math.max(0, s.food - FOOD_DRAIN * dt);
  s.water = Math.max(0, s.water - WATER_DRAIN * dt);
  const empty = emptyCount(hero);
  if (empty && s.hp > 1) s.hp = Math.max(1, s.hp - STARVE_DAMAGE * empty * dt);
}
