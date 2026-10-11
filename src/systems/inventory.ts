// The pack: everything the hero owns but does not wear. Pure rules (the menu and the shops draw them).
// Items are shared objects (ITEMS), so two potions are the same object twice in the pack; `packEntries` groups them.

import { gainXp, type Hero, type Item } from './combat';
import { equip } from './items';

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
