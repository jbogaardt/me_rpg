// Treasure chests: what they look like and what is inside. Pure rules; the Pixi side is entities/Chest.ts.
// Add a loot by naming it here, then place a chest with `z.chest(kind, loot, col, row)` (see the build-zone skill).
// Chests hold what the shops do not sell (rare gear, restoratives) and the odd purse.

import { gainXp, type Hero, type Item } from './combat';
import { addToPack, hasRoom, isBetter, wearIfBetter } from './inventory';
import { ITEMS } from './items';

/** Art variants, in the row order of public/tilesets/chests.png (each row: open frame, then closed frame). */
export const CHEST_KINDS = ['wood', 'oak', 'iron', 'silver'] as const;
export type ChestKind = (typeof CHEST_KINDS)[number];

export type ChestLoot =
  | { item: Item } // a piece of gear: put on if it beats what the hero wears
  | { hp: number; mp?: number } // a restorative (HP and MP given back)
  | { xp: number }
  | { gold: number };

export const CHEST_LOOTS: Record<string, ChestLoot> = {
  bronzeSword: { item: ITEMS.bronzeSword },
  steelSword: { item: ITEMS.steelSword },
  silverSword: { item: ITEMS.silverSword },
  shortBow: { item: ITEMS.shortBow },
  recurveBow: { item: ITEMS.recurveBow },
  greatBow: { item: ITEMS.greatBow },
  woodenShield: { item: ITEMS.woodenShield },
  ironShield: { item: ITEMS.ironShield },
  kiteShield: { item: ITEMS.kiteShield },
  parryingDagger: { item: ITEMS.parryingDagger },
  clothHood: { item: ITEMS.clothHood },
  nasalHelm: { item: ITEMS.nasalHelm },
  kettleHat: { item: ITEMS.kettleHat },
  vikingHelm: { item: ITEMS.vikingHelm },
  legionHelm: { item: ITEMS.legionHelm },
  greatHelm: { item: ITEMS.greatHelm },
  leatherArmor: { item: ITEMS.leatherArmor },
  legionArmor: { item: ITEMS.legionArmor },
  plateArmor: { item: ITEMS.plateArmor },
  paddedLeggings: { item: ITEMS.paddedLeggings },
  ironGreaves: { item: ITEMS.ironGreaves },
  steelGreaves: { item: ITEMS.steelGreaves },
  leatherBoots: { item: ITEMS.leatherBoots },
  foldedBoots: { item: ITEMS.foldedBoots },
  ironBoots: { item: ITEMS.ironBoots },
  steelBoots: { item: ITEMS.steelBoots },
  whetstone: { item: ITEMS.whetstone },
  bandageKit: { item: ITEMS.bandageKit },
  sack: { item: ITEMS.sack },
  backpack: { item: ITEMS.backpack },
  potion: { hp: 20 },
  elixir: { hp: 40, mp: 40 },
  relic: { xp: 40 },
  coins: { gold: 30 },
  purse: { gold: 90 },
  hoard: { gold: 200 },
};

export interface Found {
  text: string; // short, shown floating over the chest
  gear?: Item; // set when the hero put something on (the caller recomposes the sprite)
  /** The chest could not be emptied (the pack is full): leave it closed so the loot is still there. */
  refused?: boolean;
  levels: number; // level-ups gained
}

/**
 * Give the hero what is in a chest. Gear goes on if its slot is empty or it is an upgrade (the old piece goes to the
 * pack), otherwise into the pack; a full pack refuses it and the chest stays shut.
 */
export function collect(hero: Hero, loot: ChestLoot): Found {
  if ('item' in loot) {
    const { item } = loot;
    const worn = item.slot && (item.slot === 'weapon' ? hero.weapon : hero[item.slot]);
    if (item.slot && (!worn || isBetter(hero, item))) {
      // Wear it; what it replaces goes to the pack (so a full pack, with nowhere to put that, refuses it).
      if (worn && !hasRoom(hero)) return { text: 'Pack full', refused: true, levels: 0 };
      wearIfBetter(hero, item);
      return { text: `${item.name}!`, gear: item, levels: 0 };
    }
    if (!hasRoom(hero)) return { text: 'Pack full', refused: true, levels: 0 };
    addToPack(hero, item);
    return { text: `${item.name} (in pack)`, levels: 0 };
  }
  if ('gold' in loot) {
    hero.gold += loot.gold;
    return { text: `+${loot.gold} gold`, levels: 0 };
  }
  const s = hero.stats;
  if ('xp' in loot) return { text: `+${loot.xp} XP`, levels: gainXp(s, loot.xp) };
  s.hp = Math.min(s.maxHp, s.hp + loot.hp);
  s.mp = Math.min(s.maxMp, s.mp + (loot.mp ?? 0));
  return { text: loot.mp ? 'HP and MP restored' : `+${loot.hp} HP`, levels: 0 };
}
