// The pack: everything the hero owns but does not wear. Pure rules (the menu and the shops draw them).
// Items are shared objects (ITEMS), so two potions are the same object twice in the pack; `packEntries` groups them.

import { GEAR_SLOTS, gainXp, type Hero, type Item } from './combat';
import { equip, ITEMS, type ItemId } from './items';

/** A piece's worth in its slot: attack for blades and bows, defense for armor and shields, both added for a mix. */
const worth = (item: Item | undefined) => (item?.attack ?? 0) + (item?.defense ?? 0);

/** Is `item` better than what the hero wears in its slot (an empty slot takes anything)? */
export function isBetter(hero: Hero, item: Item): boolean {
  if (!item.slot) return false;
  const current = hero[item.slot];
  return !current || worth(item) > worth(current);
}

/** How much better (positive) or worse (negative) `item` is than what the hero wears in its slot. */
export const upgrade = (hero: Hero, item: Item): number => (item.slot ? worth(item) - worth(hero[item.slot]) : 0);

/** Does the hero wear exactly this item? */
export const isWorn = (hero: Hero, item: Item): boolean => (item.slot ? hero[item.slot] === item : false);

export interface PackEntry {
  item: Item;
  count: number;
}

/** The pack grouped by item, in the order each kind first arrived. */
export function packEntries(hero: Hero): PackEntry[] {
  const entries: PackEntry[] = [];
  for (const item of hero.bag) {
    const entry = entries.find((e) => e.item === item);
    if (entry) entry.count++;
    else entries.push({ item, count: 1 });
  }
  return entries;
}

/** Put one more of `item` in the pack. */
export const addToPack = (hero: Hero, item: Item): void => void hero.bag.push(item);

/** Take one of `item` out of the pack. Returns false if there was none. */
export function takeFromPack(hero: Hero, item: Item): boolean {
  const i = hero.bag.indexOf(item);
  if (i < 0) return false;
  hero.bag.splice(i, 1);
  return true;
}

/** Put `item` on, in its slot. What was there goes into the pack (so it can be sold or put back on). */
export function wear(hero: Hero, item: Item): void {
  if (!item.slot) throw new Error(`${item.name} has no slot, so it cannot be worn`);
  const displaced = hero[item.slot];
  equip(hero, item);
  if (displaced) hero.bag.push(displaced);
}

/** Wear a piece from the pack. Returns false if it is not there or cannot be worn. */
export function wearFromPack(hero: Hero, item: Item): boolean {
  if (!item.slot || !takeFromPack(hero, item)) return false;
  wear(hero, item);
  return true;
}

export interface Used {
  text: string; // short, shown floating over the hero
  levels: number; // level-ups gained (always 0 for now)
}

/** Drink a supply from the pack. Null when there is none, it is not a supply, or it would do nothing. */
export function useFromPack(hero: Hero, item: Item): Used | null {
  const { use } = item;
  const s = hero.stats;
  if (!use || !hero.bag.includes(item)) return null;
  if (s.hp >= s.maxHp && (!use.mp || s.mp >= s.maxMp)) return null;
  takeFromPack(hero, item);
  s.hp = Math.min(s.maxHp, s.hp + use.hp);
  s.mp = Math.min(s.maxMp, s.mp + (use.mp ?? 0));
  return { text: use.mp ? 'HP and MP restored' : `+${use.hp} HP`, levels: gainXp(s, 0) };
}

// --- Item codes: how a hero's gear and pack travel over the network (src/net/protocol.ts). A code is the item's
// place in ITEMS plus one (0 means nothing), so the same build on both sides agrees on every code.

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const ITEM_COUNT = ITEM_IDS.length;

/** The code of an item (0 if it is not one of ITEMS). */
export const itemCode = (item: Item): number => ITEM_IDS.findIndex((id) => ITEMS[id] === item) + 1;

/** The item with this code, or undefined for 0 and unknown codes. */
export const itemFromCode = (code: number): Item | undefined => {
  const id = ITEM_IDS[code - 1];
  return id ? ITEMS[id] : undefined;
};

/** What the hero wears, one code per slot in GEAR_SLOTS order. */
export const gearCodes = (hero: Hero): number[] => GEAR_SLOTS.map((slot) => (hero[slot] ? itemCode(hero[slot]) : 0));

/** Wear exactly what `codes` says (a guest's copy of the host's hero). The weapon slot is never left empty. */
export function setGear(hero: Hero, codes: readonly number[]): void {
  GEAR_SLOTS.forEach((slot, i) => {
    const item = itemFromCode(codes[i] ?? 0);
    if (slot === 'weapon') hero.weapon = item ?? hero.weapon;
    else if (item) hero[slot] = item;
    else delete hero[slot];
  });
}

/** The pack as codes, and back (unknown codes are dropped). */
export const bagCodes = (hero: Hero): number[] => hero.bag.map(itemCode);
export const setBag = (hero: Hero, codes: readonly number[]): void => {
  hero.bag = codes.flatMap((c) => itemFromCode(c) ?? []);
};
