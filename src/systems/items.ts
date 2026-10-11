// Gear the hero can equip. Each item carries the sprite parts it puts on the character (ids from sprites/parts.ts),
// so equipping something changes how the hero looks. Add an item here and, if it needs new art, add the part to
// sprites/parts.ts and run `npm run sprites -- build`.
//
// Slots (see GEAR_SLOTS): weapon, offhand (a shield, or a second blade), head, chest, legs, feet and cape. A piece
// replaces the hero's base clothes in the doll slots its `look` sets, so an empty slot shows the base clothes.

import type { Hero, Item } from './combat';

/** A bow's flight: arrows are free, so they are slower to follow up than a sword but reach well past a Time Bolt. */
const bow = (speed: number, range: number, cooldown: number) => ({ speed, range, cooldown });

export const ITEMS = {
  // Melee weapons (one `weapon` part each). Swings use the LPC 128px slash art, so only the sword family fits for now.
  rustySword: { name: 'Rusty Sword', slot: 'weapon', attack: 2, look: { weapon: 'weapon.arming_iron' } },
  bronzeSword: { name: 'Bronze Sword', slot: 'weapon', attack: 3, look: { weapon: 'weapon.arming_bronze' } },
  steelSword: { name: 'Steel Sword', slot: 'weapon', attack: 5, look: { weapon: 'weapon.arming_steel' } },
  silverSword: { name: 'Silver Sword', slot: 'weapon', attack: 7, look: { weapon: 'weapon.arming_silver' } },
  // Ranged weapons: the action key shoots an arrow the way the hero is heading. Weaker than a sword of the same tier
  // (the price of staying out of reach), and a little slower between shots.
  shortBow: {
    name: 'Short Bow',
    slot: 'weapon',
    attack: 2,
    ranged: bow(300, 8 * 32, 0.6),
    look: { weapon: 'weapon.bow_light' },
  },
  recurveBow: {
    name: 'Recurve Bow',
    slot: 'weapon',
    attack: 4,
    ranged: bow(340, 9 * 32, 0.55),
    look: { weapon: 'weapon.bow_recurve' },
  },
  greatBow: {
    name: 'Great Bow',
    slot: 'weapon',
    attack: 6,
    ranged: bow(380, 10 * 32, 0.7),
    look: { weapon: 'weapon.bow_great' },
  },

  // Off-hand: a shield (defense) or a second blade (attack), worn alongside whatever the main hand holds.
  woodenShield: { name: 'Wooden Shield', slot: 'offhand', defense: 1, look: { shield: 'shield.round_brown' } },
  ironShield: { name: 'Iron Shield', slot: 'offhand', defense: 2, look: { shield: 'shield.round_black' } },
  kiteShield: { name: 'Kite Shield', slot: 'offhand', defense: 3, look: { shield: 'shield.kite_gray' } },
  parryingDagger: { name: 'Parrying Dagger', slot: 'offhand', attack: 2, look: { shield: 'shield.dagger_left' } },

  // Helmets
  clothHood: { name: 'Cloth Hood', slot: 'head', defense: 1, look: { headwear: 'headwear.hood_brown' } },
  nasalHelm: { name: 'Nasal Helm', slot: 'head', defense: 1, look: { headwear: 'headwear.nasal' } },
  kettleHat: { name: 'Kettle Hat', slot: 'head', defense: 2, look: { headwear: 'headwear.kettle' } },
  vikingHelm: { name: 'Viking Helm', slot: 'head', defense: 2, look: { headwear: 'headwear.barbarian' } },
  legionHelm: { name: 'Legion Helm', slot: 'head', defense: 2, look: { headwear: 'headwear.legion' } },
  greatHelm: { name: 'Great Helm', slot: 'head', defense: 3, look: { headwear: 'headwear.greathelm' } },

  // Chestplates
  leatherArmor: { name: 'Leather Armor', slot: 'chest', defense: 2, look: { torso: 'torso.leather' } },
  legionArmor: { name: 'Legion Armor', slot: 'chest', defense: 3, look: { torso: 'torso.legion_iron' } },
  plateArmor: { name: 'Plate Armor', slot: 'chest', defense: 4, look: { torso: 'torso.plate_steel' } },

  // Leggings
  paddedLeggings: { name: 'Padded Leggings', slot: 'legs', defense: 1, look: { legs: 'legs.leggings_charcoal' } },
  ironGreaves: { name: 'Iron Greaves', slot: 'legs', defense: 1, look: { legs: 'legs.plate_iron' } },
  steelGreaves: { name: 'Steel Greaves', slot: 'legs', defense: 2, look: { legs: 'legs.plate_steel' } },

  // Boots
  leatherBoots: { name: 'Leather Boots', slot: 'feet', defense: 1, look: { feet: 'feet.boots_black' } },
  foldedBoots: { name: 'Folded Boots', slot: 'feet', defense: 1, look: { feet: 'feet.boots_fold_tan' } },
  ironBoots: { name: 'Iron Boots', slot: 'feet', defense: 1, look: { feet: 'feet.plate_iron' } },
  steelBoots: { name: 'Steel Boots', slot: 'feet', defense: 2, look: { feet: 'feet.plate_steel' } },

  // Cloaks
  travelerCloak: { name: "Traveler's Cloak", slot: 'cape', defense: 1, look: { cape: 'cape.maroon' } },

  // Tools: one is held at a time. Until tools do things in the world they add a small edge.
  whetstone: { name: 'Whetstone', slot: 'tool', attack: 1, look: {} },
  bandageKit: { name: 'Bandage Kit', slot: 'tool', defense: 1, look: {} },

  // (Tools and bags have no art on the doll, so their look is empty.)
  // Bags: worn on the back, each adds pack slots (the pack holds BASE_PACK without one).
  sack: { name: 'Sack', slot: 'bag', capacity: 4, look: {} },
  backpack: { name: 'Backpack', slot: 'bag', capacity: 8, look: {} },
} satisfies Record<string, Item>;

export type ItemId = keyof typeof ITEMS;

/** Put an item on the hero, in the slot it belongs to (what was there is replaced). */
export function equip(hero: Hero, item: Item): void {
  if (!item.slot) throw new Error(`${item.name} has no slot, so it cannot be equipped`);
  hero[item.slot] = item;
}

/** Does the weapon shoot rather than swing? */
export const isRanged = (item: Item): boolean => item.ranged !== undefined;
