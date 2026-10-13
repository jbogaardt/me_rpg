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

/**
 * A crop grows in `CROP_PHASES` phases, and each phase needs its own watering: a picked plot is dry; water it and it
 * grows for a third of `grow`, then dries out again showing the next stage; the third watering carries it to ripe.
 */
export const CROP_PHASES = CROP_STAGES - 1;

/** Seconds one watered phase lasts. */
export const phaseTime = (grow: number): number => grow / CROP_PHASES;

/** The state of a plot as it travels to a guest: a small number, 0-5 growing (phase * 2, plus 1 while dry) or `RIPE_CODE`. */
export const RIPE_CODE = CROP_PHASES * 2;

export interface CropState {
  ripe: boolean;
  /** 0..CROP_PHASES-1 while growing (the stage drawn); 0 once ripe (the ripe stage is drawn instead). */
  phase: number;
  /** Waiting for water. Never true when ripe. */
  dry: boolean;
}

export const cropCode = ({ ripe, phase, dry }: CropState): number => (ripe ? RIPE_CODE : phase * 2 + (dry ? 1 : 0));

/** Read a code back; null when it is not one. */
export function cropFromCode(code: unknown): CropState | null {
  if (typeof code !== 'number' || !Number.isInteger(code) || code < 0 || code > RIPE_CODE) return null;
  if (code === RIPE_CODE) return { ripe: true, phase: 0, dry: false };
  return { ripe: false, phase: code >> 1, dry: (code & 1) === 1 };
}

/** The stage to draw: the phase while growing, the last stage when ripe. */
export const cropStage = ({ ripe, phase }: Pick<CropState, 'ripe' | 'phase'>): number =>
  ripe ? CROP_STAGES - 1 : phase;

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
