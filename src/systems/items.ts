// Gear the hero can equip. Each item carries the sprite parts it puts on the character (ids from sprites/parts.ts),
// so equipping something changes how the hero looks. Add an item here and, if it needs new art, add the part to
// sprites/parts.ts and run `npm run sprites -- build`.
//
// Every item has a `value` in gold: what a shop charges for it. A shop pays 40% of that when buying it back (systems/shops.ts).
//
// Slots (see GEAR_SLOTS): weapon, offhand (a shield, or a second blade), head, chest, legs, feet, cape, tool, bag and charm. A piece
// replaces the hero's base clothes in the doll slots its `look` sets, so an empty slot shows the base clothes.

import type { Hero, Item } from './combat';
import type { Combo, SpellId } from './spells';

/** A bow's flight: about three quarters of a sword's damage per second (the price of standing back), with a reach well past a wand's bolt. */
const bow = (speed: number, range: number, cooldown: number) => ({ speed, range, cooldown });

/** One combo of a wand or tome: the directions to tap, the spell, its mana cost and strength (see systems/spells.ts). */
const combo = (keys: string, spell: SpellId, cost: number, power: number, count?: number): Combo => ({
  keys,
  spell,
  cost,
  power,
  ...(count === undefined ? {} : { count }),
});

export const ITEMS = {
  // Melee weapons (one `weapon` part each). Swings use the LPC 128px slash art, so only the sword family fits for now.
  rustySword: { name: 'Rusty Sword', value: 4, slot: 'weapon', attack: 2, look: { weapon: 'weapon.arming_iron' } },
  bronzeSword: { name: 'Bronze Sword', value: 40, slot: 'weapon', attack: 3, look: { weapon: 'weapon.arming_bronze' } },
  steelSword: { name: 'Steel Sword', value: 150, slot: 'weapon', attack: 5, look: { weapon: 'weapon.arming_steel' } },
  silverSword: {
    name: 'Silver Sword',
    value: 400,
    slot: 'weapon',
    attack: 7,
    look: { weapon: 'weapon.arming_silver' },
  },
  // Ranged weapons: the action key shoots an arrow the way the hero is heading. About 75% of a sword's damage per second
  // at the same price (the price of staying out of reach).
  shortBow: {
    name: 'Short Bow',
    value: 35,
    slot: 'weapon',
    attack: 3,
    ranged: bow(300, 8 * 32, 0.45),
    look: { weapon: 'weapon.bow_light' },
  },
  recurveBow: {
    name: 'Recurve Bow',
    value: 120,
    slot: 'weapon',
    attack: 5,
    ranged: bow(340, 9 * 32, 0.42),
    look: { weapon: 'weapon.bow_recurve' },
  },
  greatBow: {
    name: 'Great Bow',
    value: 300,
    slot: 'weapon',
    attack: 8,
    ranged: bow(380, 10 * 32, 0.5),
    look: { weapon: 'weapon.bow_great' },
  },

  // Off-hand: a shield (defense) or a second blade (attack), worn alongside whatever the main hand holds.
  woodenShield: {
    name: 'Wooden Shield',
    value: 25,
    slot: 'offhand',
    defense: 1,
    look: { shield: 'shield.round_brown' },
  },
  ironShield: { name: 'Iron Shield', value: 90, slot: 'offhand', defense: 2, look: { shield: 'shield.round_black' } },
  kiteShield: { name: 'Kite Shield', value: 200, slot: 'offhand', defense: 3, look: { shield: 'shield.kite_gray' } },
  parryingDagger: {
    name: 'Parrying Dagger',
    value: 70,
    slot: 'offhand',
    attack: 2,
    look: { shield: 'shield.dagger_left' },
  },

  // Helmets
  clothHood: { name: 'Cloth Hood', value: 15, slot: 'head', defense: 1, look: { headwear: 'headwear.hood_brown' } },
  nasalHelm: { name: 'Nasal Helm', value: 40, slot: 'head', defense: 1, look: { headwear: 'headwear.nasal' } },
  kettleHat: { name: 'Kettle Hat', value: 80, slot: 'head', defense: 2, look: { headwear: 'headwear.kettle' } },
  vikingHelm: { name: 'Viking Helm', value: 90, slot: 'head', defense: 2, look: { headwear: 'headwear.barbarian' } },
  legionHelm: { name: 'Legion Helm', value: 100, slot: 'head', defense: 2, look: { headwear: 'headwear.legion' } },
  greatHelm: { name: 'Great Helm', value: 220, slot: 'head', defense: 3, look: { headwear: 'headwear.greathelm' } },

  // Chestplates
  leatherArmor: { name: 'Leather Armor', value: 60, slot: 'chest', defense: 2, look: { torso: 'torso.leather' } },
  legionArmor: { name: 'Legion Armor', value: 180, slot: 'chest', defense: 3, look: { torso: 'torso.legion_iron' } },
  plateArmor: { name: 'Plate Armor', value: 420, slot: 'chest', defense: 4, look: { torso: 'torso.plate_steel' } },

  // Leggings
  paddedLeggings: {
    name: 'Padded Leggings',
    value: 25,
    slot: 'legs',
    defense: 1,
    look: { legs: 'legs.leggings_charcoal' },
  },
  ironGreaves: { name: 'Iron Greaves', value: 80, slot: 'legs', defense: 1, look: { legs: 'legs.plate_iron' } },
  steelGreaves: { name: 'Steel Greaves', value: 160, slot: 'legs', defense: 2, look: { legs: 'legs.plate_steel' } },

  // Boots
  leatherBoots: { name: 'Leather Boots', value: 20, slot: 'feet', defense: 1, look: { feet: 'feet.boots_black' } },
  foldedBoots: { name: 'Folded Boots', value: 25, slot: 'feet', defense: 1, look: { feet: 'feet.boots_fold_tan' } },
  ironBoots: { name: 'Iron Boots', value: 70, slot: 'feet', defense: 1, look: { feet: 'feet.plate_iron' } },
  steelBoots: { name: 'Steel Boots', value: 140, slot: 'feet', defense: 2, look: { feet: 'feet.plate_steel' } },

  // Cloaks
  travelerCloak: { name: "Traveler's Cloak", value: 30, slot: 'cape', defense: 1, look: { cape: 'cape.maroon' } },

  // Supplies: kept in the pack and drunk from the Inventory screen (the apothecary sells them).
  potion: { name: 'Potion', value: 15, use: { hp: 20 } },
  elixir: { name: 'Elixir', value: 60, use: { hp: 40, mp: 40 } },

  // Tools: one is held at a time. Until tools do things in the world they add a small edge.
  whetstone: { name: 'Whetstone', value: 40, slot: 'tool', attack: 1, look: {} },
  bandageKit: { name: 'Bandage Kit', value: 40, slot: 'tool', defense: 1, look: {} },

  // (Tools and bags have no art on the doll, so their look is empty.)
  // Bags: worn on the back, each adds pack slots (the pack holds BASE_PACK without one).
  sack: { name: 'Sack', value: 50, slot: 'bag', capacity: 4, look: {} },
  backpack: { name: 'Backpack', value: 150, slot: 'bag', capacity: 8, look: {} },

  // Wands and tomes (the wizard sells them): weapons whose plain attack is a free, weak bolt and whose combos (a string
  // of directions, five on a first-tier weapon and six on a second-tier one) cast far stronger spells for mana. A wand is quick and
  // sharp; a tome is slow and heavy. Every wand and tome has its own spells: none is on two weapons.
  // They have no art on the hero yet, so `look` is empty. New items go at the end (item codes are positions).
  apprenticeWand: {
    name: 'Apprentice Wand',
    value: 70,
    slot: 'weapon',
    attack: 2,
    look: {},
    focus: {
      kind: 'wand',
      power: 2,
      cooldown: 0.45,
      combos: [combo('urulr', 'bolt', 6, 1.4), combo('ldlrd', 'fan', 11, 0.8, 3), combo('drudl', 'dash', 8, 0.9)],
    },
  },
  stormcallerWand: {
    name: 'Stormcaller Wand',
    value: 280,
    slot: 'weapon',
    attack: 4,
    look: {},
    focus: {
      kind: 'wand',
      power: 5,
      cooldown: 0.4,
      combos: [
        combo('lrlrlr', 'chain', 17, 1.1, 3),
        combo('ululdr', 'lance', 15, 1.2),
        combo('dudrdr', 'smite', 13, 1.6),
        combo('rdrdlu', 'gale', 12, 0.9),
      ],
    },
  },
  noviceTome: {
    name: 'Novice Tome',
    value: 90,
    slot: 'weapon',
    attack: 3,
    look: {},
    focus: {
      kind: 'tome',
      power: 3,
      cooldown: 0.8,
      combos: [combo('udlru', 'nova', 14, 1.1), combo('rdrul', 'heal', 11, 1.5), combo('lulrd', 'ward', 17, 2)],
    },
  },
  arcaneGrimoire: {
    name: 'Arcane Grimoire',
    value: 320,
    slot: 'weapon',
    attack: 5,
    look: {},
    focus: {
      kind: 'tome',
      power: 6,
      cooldown: 0.75,
      combos: [
        combo('uldrdl', 'blast', 22, 1.7),
        combo('ludrud', 'drain', 19, 1),
        combo('dlrlru', 'freeze', 20, 0.7, 3),
        combo('urdrdl', 'vortex', 18, 0.9),
      ],
    },
  },

  // Quest rewards (systems/quests.ts): no shop sells these. Each carries a buff beyond attack and defense, and the
  // `rare` flag gives it the gold slot colour. Charms hang round the neck (slot `charm`) and have no art on the doll.
  // New items go at the end of this list: a code is an item's place in it (see inventory.ts).
  wayfarersCharm: { name: "Wayfarer's Charm", value: 200, slot: 'charm', speed: 8, rare: true, look: {} },
  wardensMantle: {
    name: "Warden's Mantle",
    value: 260,
    slot: 'cape',
    defense: 2,
    regen: 0.5,
    rare: true,
    look: { cape: 'cape.navy' },
  },
  duneglassBoots: {
    name: 'Duneglass Boots',
    value: 320,
    slot: 'feet',
    defense: 2,
    speed: 10,
    rare: true,
    look: { feet: 'feet.boots_fold_tan' },
  },
  tuskbreakerHelm: {
    name: 'Tuskbreaker Helm',
    value: 380,
    slot: 'head',
    defense: 3,
    goldBonus: 15,
    rare: true,
    look: { headwear: 'headwear.barbarian' },
  },
  sunforgedCuirass: {
    name: 'Sunforged Cuirass',
    value: 520,
    slot: 'chest',
    defense: 5,
    regen: 0.4,
    rare: true,
    look: { torso: 'torso.plate_gold' },
  },
  hourglassPendant: {
    name: 'Hourglass Pendant',
    value: 700,
    slot: 'charm',
    speed: 12,
    magic: 4,
    xpBonus: 10,
    mpRegen: 0.5,
    rare: true,
    look: {},
  },

  // Provisions (appended: item codes are positions in this list). They fill the food and water meters (systems/needs.ts).
  bread: { name: 'Bread', value: 5, use: { hp: 0, food: 30 } },
  roastMeat: { name: 'Roast Meat', value: 12, use: { hp: 5, food: 55 } },
  apple: { name: 'Apple', value: 4, use: { hp: 0, food: 12, water: 12 } },
  waterskin: { name: 'Waterskin', value: 5, use: { hp: 0, water: 55 } },

  // Produce picked from crop plots (systems/crops.ts): raw, so each fills less than cooked food but it is free.
  potato: { name: 'Potato', value: 3, use: { hp: 0, food: 22 } },
  carrot: { name: 'Carrot', value: 3, use: { hp: 0, food: 14, water: 6 } },
  cabbage: { name: 'Cabbage', value: 4, use: { hp: 0, food: 20, water: 10 } },
  tomato: { name: 'Tomato', value: 3, use: { hp: 0, food: 10, water: 16 } },
  strawberry: { name: 'Strawberry', value: 3, use: { hp: 0, food: 7, water: 12 } },
  pumpkin: { name: 'Pumpkin', value: 8, use: { hp: 0, food: 40, water: 5 } },
  watermelon: { name: 'Watermelon', value: 8, use: { hp: 0, food: 14, water: 40 } },
} satisfies Record<string, Item>;

export type ItemId = keyof typeof ITEMS;

/** Put an item on the hero, in the slot it belongs to (what was there is replaced). */
export function equip(hero: Hero, item: Item): void {
  if (!item.slot) throw new Error(`${item.name} has no slot, so it cannot be equipped`);
  hero[item.slot] = item;
}

/** Does the weapon shoot rather than swing? */
export const isRanged = (item: Item): boolean => item.ranged !== undefined;
