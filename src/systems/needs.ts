// Food and water: two meters (0..NEED_MAX) that drain with time and are refilled by eating and drinking supplies.
// Pixi-free so the rules are unit-tested. They are gentle: a fed and watered hero mends a little faster, a hungry
// or thirsty one mends more slowly, and one with an empty meter stops mending on their own. Nothing here hurts.

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
  if (k === 0) return 'Too weak to mend on your own';
  if (k < 1) return 'Mending slowly';
  if (k > 1) return 'Mending faster';
  return '';
}
