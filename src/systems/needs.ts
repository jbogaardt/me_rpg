// Food and water: two meters (0..NEED_MAX) that drain with time and are refilled by eating and drinking supplies.
// Pixi-free so the rules are unit-tested. A fed and watered hero mends a little faster, a hungry or thirsty one mends
// more slowly, one with an empty meter stops mending, and one with both empty loses health (never the last point).
// Standing at the edge of a pond, a hero can also drink from it (`drinkableNear`, `drinkFrom`).

import { CELL, type MapData } from '../map/types';

export const NEED_MAX = 100;

/** Meter points lost per second: food lasts about 20 minutes, water about 14 (a day is 12 minutes). */
export const FOOD_DRAIN = NEED_MAX / (20 * 60);
export const WATER_DRAIN = NEED_MAX / (14 * 60);

export interface Needs {
  food: number; // fractional while draining; show Math.ceil
  water: number;
}

export type NeedLevel = 'full' | 'ok' | 'low' | 'empty';

export const newNeeds = (): Needs => ({ food: NEED_MAX, water: NEED_MAX });

/** How a meter reads: full from 60, fine from 20, low above 0, empty at 0. */
export function needLevel(value: number): NeedLevel {
  if (value >= 60) return 'full';
  if (value >= 20) return 'ok';
  return value > 0 ? 'low' : 'empty';
}

const REGEN_FACTOR: Record<NeedLevel, number> = { full: 1.25, ok: 1, low: 0.5, empty: 0 };

/** Multiplier on the natural HP and MP regeneration (gear that mends is not affected): the worse of the two meters decides. */
export function needsRegen(n: Needs): number {
  const f = REGEN_FACTOR[needLevel(n.food)];
  const w = REGEN_FACTOR[needLevel(n.water)];
  return Math.min(f, w);
}

/** Let time pass. */
export function drainNeeds(n: Needs, dt: number): void {
  n.food = Math.max(0, n.food - FOOD_DRAIN * dt);
  n.water = Math.max(0, n.water - WATER_DRAIN * dt);
}

/** Refill the meters (never past full). Returns false when it would change nothing. */
export function refill(n: Needs, food: number, water: number): boolean {
  if ((food <= 0 || n.food >= NEED_MAX) && (water <= 0 || n.water >= NEED_MAX)) return false;
  n.food = Math.min(NEED_MAX, n.food + Math.max(0, food));
  n.water = Math.min(NEED_MAX, n.water + Math.max(0, water));
  return true;
}

/** A short word for the HUD tooltip and the Status tab. */
export const needWord = (kind: 'food' | 'water', value: number): string => {
  const level = needLevel(value);
  if (kind === 'food') return { full: 'Well fed', ok: 'Fed', low: 'Hungry', empty: 'Starving' }[level];
  return { full: 'Hydrated', ok: 'Fine', low: 'Thirsty', empty: 'Parched' }[level];
};

/** What the meters mean for mending, in a line ("" when all is well). */
export function needsNote(n: Needs): string {
  const k = needsRegen(n);
  if (k === 0) return starveRate(n, 1) > 0 ? 'Losing health to hunger and thirst' : 'Too weak to mend on your own';
  if (k < 1) return 'Mending slowly';
  if (k > 1) return 'Mending faster';
  return '';
}

/** Share of max HP lost per second while food and water are both empty. The hero is left on 1 HP, never killed. */
export const STARVE_SHARE = 0.03;

/** HP lost per second to hunger and thirst: only when both meters are empty. */
export function starveRate(n: Needs, maxHp: number): number {
  return n.food <= 0 && n.water <= 0 ? STARVE_SHARE * maxHp : 0;
}

/** Water points one drink from a pond gives. */
export const POND_SIP = 40;

/** How far (px) from a hero's feet to the edge of the water they may drink from: the bank cell beside it. */
export const DRINK_REACH = CELL * 0.9;

/** Ground a hero may drink: a pond's clear water (the sea is salt, swamp water foul, ice frozen). */
const DRINKABLE = 'water';

/**
 * The middle of the nearest drinkable water cell whose edge is within `reach` of (x, y), or null. A pond's water cells
 * are solid, so the hero stands on the bank and the nearest edge is what counts, not the middle.
 */
export function drinkableNear(
  data: Pick<MapData, 'width' | 'height' | 'surfaces' | 'surface'>,
  x: number,
  y: number,
  reach = DRINK_REACH,
): { x: number; y: number } | null {
  const id = data.surfaces.indexOf(DRINKABLE);
  if (id < 0) return null;
  const c0 = Math.max(0, Math.floor((x - reach) / CELL));
  const c1 = Math.min(data.width - 1, Math.floor((x + reach) / CELL));
  const r0 = Math.max(0, Math.floor((y - reach) / CELL));
  const r1 = Math.min(data.height - 1, Math.floor((y + reach) / CELL));
  let best: { x: number; y: number } | null = null;
  let bestDist = reach;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (data.surface[r * data.width + c] !== id) continue;
      const dx = Math.max(c * CELL - x, 0, x - (c + 1) * CELL);
      const dy = Math.max(r * CELL - y, 0, y - (r + 1) * CELL);
      const d = Math.hypot(dx, dy);
      if (d > bestDist) continue;
      bestDist = d;
      best = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
    }
  }
  return best;
}

/** Is there anything to drink for? (The Drink button only shows when there is.) */
export const thirsty = (n: Needs): boolean => Math.ceil(n.water) < NEED_MAX;

/** Take a drink from a pond: `POND_SIP` water, refused when the hero is not thirsty. */
export function drinkFrom(n: Needs): { ok: boolean; text: string } {
  if (!refill(n, 0, POND_SIP)) return { ok: false, text: 'Not thirsty' };
  return { ok: true, text: `+${POND_SIP} water` };
}
