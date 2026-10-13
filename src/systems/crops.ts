// Crops: plots in the world that grow a vegetable or fruit, ripen over a few minutes, and are picked with the action
// key. Pure rules; the Pixi side is entities/Crop.ts. Add a crop by naming it here (the art is one row of
// public/tilesets/crops.png, cut by tools/map/crops.ts) and giving its produce an item in systems/items.ts.
// The produce is eaten from the Inventory for food and water (see needs.ts). A plot only grows while it is watered:
// a freshly picked one is dry and shows "Needs water" until a player waters it with a Waterskin from their pack.

import type { Hero, Item } from './combat';
import { packFree, takeFromPack } from './inventory';
import { ITEMS, type ItemId } from './items';

export interface CropKind {
  name: string;
  /** What one pick yields (a key of ITEMS). */
  item: ItemId;
  /** How many of `item` one pick gives. */
  yield: number;
  /** Seconds from a fresh sprout to ripe. */
  grow: number;
}

/** Growth stages drawn: 0 sprout, 1, 2, then 3 ripe. The art has one column per stage. */
export const CROP_STAGES = 4;

/** Row order is the row order of public/tilesets/crops.png. */
export const CROPS = {
  potato: { name: 'Potatoes', item: 'potato', yield: 2, grow: 150 },
  carrot: { name: 'Carrots', item: 'carrot', yield: 2, grow: 120 },
  cabbage: { name: 'Cabbage', item: 'cabbage', yield: 1, grow: 180 },
  tomato: { name: 'Tomatoes', item: 'tomato', yield: 2, grow: 120 },
  strawberry: { name: 'Strawberries', item: 'strawberry', yield: 2, grow: 100 },
  pumpkin: { name: 'Pumpkin', item: 'pumpkin', yield: 1, grow: 240 },
  watermelon: { name: 'Watermelon', item: 'watermelon', yield: 1, grow: 200 },
} satisfies Record<string, CropKind>;

export type CropName = keyof typeof CROPS;
export const CROP_KINDS = Object.keys(CROPS) as CropName[];

/** A map holds at most 30 crop plots (one bit each in SnapMsg.crops). */
export const MAX_CROPS = 30;

/** The stage to draw for a plot `age` seconds into its growth: ripe (the last stage) only once `age` reaches `grow`. */
export function cropStage(age: number, grow: number): number {
  if (age >= grow) return CROP_STAGES - 1;
  return Math.min(CROP_STAGES - 2, Math.floor((Math.max(0, age) / grow) * (CROP_STAGES - 1)));
}

export interface Harvest {
  ok: boolean;
  text: string;
  /** The produce picked (empty when refused). */
  items: Item[];
}

/** Pick a ripe plot for the hero: the produce goes to the pack, or, with no room for all of it, nothing is taken. */
export function harvest(hero: Hero, kind: string): Harvest {
  const crop = (CROPS as Record<string, CropKind>)[kind];
  if (!crop) return { ok: false, text: '', items: [] };
  if (packFree(hero) < crop.yield) return { ok: false, text: 'Pack full', items: [] };
  const item = ITEMS[crop.item];
  const items = Array.from({ length: crop.yield }, () => item);
  hero.pack.push(...items);
  return { ok: true, text: `${item.name} x${crop.yield}`, items };
}

export interface Watering {
  ok: boolean;
  text: string;
}

/** Water a dry plot for the hero: one Waterskin from the pack is used up (the same Waterskin that quenches thirst). */
export function waterWith(hero: Hero): Watering {
  const skin = hero.pack.find((i) => i === ITEMS.waterskin);
  if (!skin) return { ok: false, text: 'Need a Waterskin' };
  takeFromPack(hero, skin);
  return { ok: true, text: 'Watered' };
}
