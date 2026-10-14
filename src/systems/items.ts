// Gear and supplies: the item registry. What items a campaign has is content (public/content/<campaign>/items.json, or
// the packs' `items`, src/content/schema.ts reads them); `ContentManager.install` hands them here (`setItems`), and the
// rules look them up by id. Each item carries the sprite parts it puts on the character (ids from sprites/parts.ts), so
// equipping something changes how the hero looks; new art is a part in sprites/parts.ts and `npm run sprites -- build`.
//
// Every item has a `value` in gold: what a shop charges for it. A shop pays 40% of that when buying it back (systems/shops.ts).
//
// Slots (see GEAR_SLOTS): weapon, offhand (a shield, or a second blade), head, chest, legs, feet, cape, tool, bag and charm. A piece
// replaces the hero's base clothes in the doll slots its `look` sets, so an empty slot shows the base clothes.
//
// Item codes (systems/inventory.ts, what travels over the network) are an item's place in the campaign's list, so add
// new items at the end of a campaign's file; both co-op players play the same content (the world check), so they agree.

import type { GearSlot, Hero, Item } from './combat';

/** The campaign's items by id, in the content's order (empty until the content is installed). */
export const ITEMS: Record<string, Item> = {};

/** What a new hero starts with: an item id per gear slot (the weapon always). */
export type StartGear = { weapon: string } & Partial<Record<Exclude<GearSlot, 'weapon'>, string>>;

let start: StartGear = { weapon: '' };
let order: string[] = [];
let codes = new Map<Item, number>();

/** Install a campaign's items and its starting gear. */
export function setItems(items: Record<string, Item>, startGear: StartGear) {
  for (const id of Object.keys(ITEMS)) delete ITEMS[id];
  Object.assign(ITEMS, items);
  order = Object.keys(items);
  codes = new Map(order.map((id, i) => [items[id]!, i + 1]));
  start = startGear;
}

/** An item by id; throws for one this campaign does not have (content is checked on load, so that is a bug). */
export function itemOf(id: string): Item {
  const item = ITEMS[id];
  if (!item) throw new Error(`This campaign has no item "${id}"`);
  return item;
}

/** The id of an installed item (undefined for one that is not). */
export const idOfItem = (item: Item): string | undefined => order[(codes.get(item) ?? 0) - 1];

/** Item ids in the content's order (a code is a place in it plus one). */
export const itemIds = (): readonly string[] => order;

/** The code of an item: its place in the list plus one (0 if it is not one of ITEMS). */
export const itemCodeOf = (item: Item): number => codes.get(item) ?? 0;

/** The gear a new hero starts in. */
export function startGear(): Partial<Record<GearSlot, Item>> & { weapon: Item } {
  const gear: Partial<Record<GearSlot, Item>> = {};
  for (const [slot, id] of Object.entries(start)) if (id) gear[slot as GearSlot] = itemOf(id);
  return gear as Partial<Record<GearSlot, Item>> & { weapon: Item };
}

/** An item's id (a key of the campaign's items). */
export type ItemId = string;

/** Put an item on the hero, in the slot it belongs to (what was there is replaced). */
export function equip(hero: Hero, item: Item): void {
  if (!item.slot) throw new Error(`${item.name} has no slot, so it cannot be equipped`);
  hero[item.slot] = item;
}

/** Does the weapon shoot rather than swing? */
export const isRanged = (item: Item): boolean => item.ranged !== undefined;
