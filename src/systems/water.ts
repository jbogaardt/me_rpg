import { CELL, type MapData } from '../map/types';
import type { Hero } from './combat';
import { MAX_VITAL } from './survival';

// Where to drink: a well (a solid map object, `z.well(col, row)`, entities/Well.ts) or any clear open water, a pond or a
// lake (the `water` surface; the sea, a bog or lava are not drinkable). Pixi-free rules; scenes/overworld/Drinking.ts is
// what the action key does. Water fills the thirst bar (systems/survival.ts) and costs nothing.

/** How much one drink gives. */
export const DRINK = 35;
/**
 * Open water is only drunk from when the hero is thirstier than this, so swinging a sword beside a pond still swings (a
 * well always answers: it is an object you stand at, like a chest).
 */
export const THIRSTY_BELOW = 90;
/** How close (feet to a water cell's middle) the hero must be to drink from open water: standing on the bank. */
export const WATER_REACH = CELL * 1.5;
/** The surface name of water that can be drunk (map `surfaces`). */
export const DRINKABLE = 'water';

export const isThirsty = (hero: Hero): boolean => hero.stats.water < THIRSTY_BELOW;

/** Is there clear open water within `reach` of this world point? */
export function waterNear(data: MapData, x: number, y: number, reach = WATER_REACH): boolean {
  const [c0, c1] = [Math.floor((x - reach) / CELL), Math.floor((x + reach) / CELL)];
  const [r0, r1] = [Math.floor((y - reach) / CELL), Math.floor((y + reach) / CELL)];
  for (let row = Math.max(0, r0); row <= Math.min(data.height - 1, r1); row++)
    for (let col = Math.max(0, c0); col <= Math.min(data.width - 1, c1); col++) {
      const id = data.surface[row * data.width + col];
      if (id === undefined || data.surfaces[id] !== DRINKABLE) continue;
      if (Math.hypot(x - (col + 0.5) * CELL, y - (row + 0.5) * CELL) < reach) return true;
    }
  return false;
}

export type Drank = { ok: true; text: string } | { ok: false; text: string };

/** Drink: fill the water bar by `DRINK` (less when nearly full), or say there is no need. */
export function drink(hero: Hero): Drank {
  const s = hero.stats;
  if (s.water >= MAX_VITAL) return { ok: false, text: 'Not thirsty' };
  const gained = Math.min(DRINK, MAX_VITAL - s.water);
  s.water += gained;
  return { ok: true, text: `+${Math.ceil(gained)} water` };
}
