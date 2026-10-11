// Gear the hero can equip. Each item carries the sprite parts it puts on the character (ids from sprites/parts.ts),
// so equipping something changes how the hero looks. Add an item here and, if it needs new art, add the part to
// sprites/parts.ts and run `npm run sprites -- build`.

import type { Hero, Item } from './combat';

export const ITEMS = {
  // Weapons (one `weapon` part each). Swings use the LPC 128px slash art, so only the sword family fits for now.
  rustySword: { name: 'Rusty Sword', slot: 'weapon', attack: 2, look: { weapon: 'weapon.arming_iron' } },
  bronzeSword: { name: 'Bronze Sword', slot: 'weapon', attack: 3, look: { weapon: 'weapon.arming_bronze' } },
  steelSword: { name: 'Steel Sword', slot: 'weapon', attack: 5, look: { weapon: 'weapon.arming_steel' } },
  silverSword: { name: 'Silver Sword', slot: 'weapon', attack: 7, look: { weapon: 'weapon.arming_silver' } },
  // Armor (any slots; whatever it sets replaces the hero's base clothes in that slot).
  travelerCloak: { name: "Traveler's Cloak", slot: 'armor', defense: 1, look: { cape: 'cape.maroon' } },
  leatherArmor: {
    name: 'Leather Armor',
    slot: 'armor',
    defense: 3,
    look: { torso: 'torso.leather', feet: 'feet.boots_black' },
  },
  legionArmor: {
    name: 'Legion Armor',
    slot: 'armor',
    defense: 5,
    look: { torso: 'torso.legion_iron', headwear: 'headwear.nasal' },
  },
  plateArmor: {
    name: 'Plate Armor',
    slot: 'armor',
    defense: 7,
    look: {
      torso: 'torso.plate_steel',
      legs: 'legs.plate_steel',
      headwear: 'headwear.greathelm',
      feet: 'feet.boots_black',
    },
  },
} satisfies Record<string, Item>;

export type ItemId = keyof typeof ITEMS;

/** Put an item on the hero, in the slot it belongs to. */
export function equip(hero: Hero, item: Item): void {
  if (item.slot === 'weapon') hero.weapon = item;
  else if (item.slot === 'armor') hero.armor = item;
  else throw new Error(`${item.name} has no slot, so it cannot be equipped`);
}
