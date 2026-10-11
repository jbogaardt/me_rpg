// Treasure chests: what they look like and what is inside. Pure rules; the Pixi side is entities/Chest.ts.
// Add a loot by naming it here, then place a chest with `z.chest(kind, loot, col, row)` (see the build-zone skill).

import { gainXp, type Hero, type Item } from './combat';
import { ITEMS } from './items';

/** Art variants, in the row order of public/tilesets/chests.png (each row: open frame, then closed frame). */
export const CHEST_KINDS = ['wood', 'oak', 'iron', 'silver'] as const;
export type ChestKind = (typeof CHEST_KINDS)[number];

export type ChestLoot =
  | { item: Item } // a piece of gear: put on if it beats what the hero wears
  | { hp: number; mp?: number } // a restorative (HP and MP given back)
  | { xp: number };

export const CHEST_LOOTS: Record<string, ChestLoot> = {
  bronzeSword: { item: ITEMS.bronzeSword },
  steelSword: { item: ITEMS.steelSword },
  silverSword: { item: ITEMS.silverSword },
  leatherArmor: { item: ITEMS.leatherArmor },
  legionArmor: { item: ITEMS.legionArmor },
  plateArmor: { item: ITEMS.plateArmor },
  potion: { hp: 20 },
  elixir: { hp: 40, mp: 40 },
  relic: { xp: 40 },
};

export interface Found {
  text: string; // short, shown floating over the chest
  gear?: Item; // set when the hero put something on (the caller recomposes the sprite)
  levels: number; // level-ups gained
}

const isBetter = (hero: Hero, item: Item) =>
  item.slot === 'weapon'
    ? (item.attack ?? 0) > (hero.weapon.attack ?? 0)
    : item.slot === 'armor' && (item.defense ?? 0) > (hero.armor.defense ?? 0);

/** Give the hero what is in a chest. Gear is worn only when it is an upgrade (there is no inventory yet). */
export function collect(hero: Hero, loot: ChestLoot): Found {
  if ('item' in loot) {
    const { item } = loot;
    if (!isBetter(hero, item)) return { text: `${item.name} (no better)`, levels: 0 };
    if (item.slot === 'weapon') hero.weapon = item;
    else hero.armor = item;
    return { text: `${item.name}!`, gear: item, levels: 0 };
  }
  const s = hero.stats;
  if ('xp' in loot) return { text: `+${loot.xp} XP`, levels: gainXp(s, loot.xp) };
  s.hp = Math.min(s.maxHp, s.hp + loot.hp);
  s.mp = Math.min(s.maxMp, s.mp + (loot.mp ?? 0));
  return { text: loot.mp ? 'HP and MP restored' : `+${loot.hp} HP`, levels: 0 };
}
