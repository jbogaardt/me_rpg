// Shops: who sells what, at what price, and the rules of buying and selling. Pure; the Pixi side places the
// shopkeepers (OverworldScene) and the HTML side draws the counter (hud/Shop.ts). A map places a shopkeeper with
// `z.shop(id, col, row)` (see the build-zone skill) and the building behind them with `z.prop('smithy', ...)`.
//
// Each shop is a specialist: it sells a few kinds of things and only buys those kinds back (the wizard: wands and tomes). Money comes mostly from
// enemies (see `MobKind.gold`); chests hold the odd purse and the gear that no shop stocks.

import { enabledAnywhere } from './capabilities';
import { onlyFeeds } from './needs';
import type { GearSlot, Hero, Item } from './combat';
import { addToPack, hasRoom, isBetter, takeFromPack, wearIfBetter } from './inventory';
import { ITEMS, type ItemId } from './items';

/** A shop pays this share of an item's value when buying it back. */
export const SELL_RATE = 0.4;

export const buyPrice = (item: Item): number => item.value ?? 0;
export const sellPrice = (item: Item): number => Math.max(1, Math.floor((item.value ?? 0) * SELL_RATE));

export interface Shop {
  /** Its key in SHOPS (what a map and the network call it). */
  id: string;
  /** The shop's name, as the counter's title. */
  name: string;
  /** Short label floating over the shopkeeper. */
  tag: string;
  /** Who stands at the counter: a key of NPC_LOOKS (systems/looks.ts). */
  keeper: string;
  /** What the shopkeeper says before the counter opens. */
  greeting: string[];
  /** What it sells, in the order shown. */
  stock: readonly ItemId[];
  /** What it buys back from the pack: only its own trade. */
  buys: (item: Item) => boolean;
}

const isSlot =
  (...slots: GearSlot[]) =>
  (item: Item) =>
    item.slot !== undefined && slots.includes(item.slot);
const isBow = (item: Item) => item.ranged !== undefined;
const isCaster = (item: Item) => item.focus !== undefined;
const isBlade = (item: Item) => item.slot === 'weapon' && !isBow(item) && !isCaster(item);
const isSupply = (item: Item) => item.use !== undefined;

export const SHOPS: Record<string, Shop> = {
  smithy: {
    id: 'smithy',
    name: "Brannoch's Forge",
    tag: 'Blacksmith',
    keeper: 'smith',
    greeting: ['Steel and iron, fresh from the fire.', 'Blades and shields: that is my trade.'],
    stock: ['bronzeSword', 'steelSword', 'silverSword', 'woodenShield', 'ironShield', 'kiteShield'],
    buys: (item) => isBlade(item) || isSlot('offhand')(item),
  },
  armory: {
    id: 'armory',
    name: "Halda's Armory",
    tag: 'Armorer',
    keeper: 'armorer',
    greeting: ['Mind the dents. Everything here has saved a life.', 'Helms, plate, leggings. Take your pick.'],
    stock: [
      'clothHood',
      'nasalHelm',
      'kettleHat',
      'greatHelm',
      'leatherArmor',
      'plateArmor',
      'paddedLeggings',
      'ironGreaves',
      'steelGreaves',
    ],
    buys: isSlot('head', 'chest', 'legs'),
  },
  ranger: {
    id: 'ranger',
    name: "The Ranger's Lodge",
    tag: 'Ranger',
    keeper: 'ranger',
    greeting: ['A good bow keeps trouble at arm... or arrow... length.', 'Bows, boots and cloaks for the road.'],
    stock: [
      'shortBow',
      'recurveBow',
      'greatBow',
      'leatherBoots',
      'foldedBoots',
      'ironBoots',
      'steelBoots',
      'travelerCloak',
    ],
    buys: (item) => isBow(item) || isSlot('feet', 'cape')(item),
  },
  apothecary: {
    id: 'apothecary',
    name: "Wren's Apothecary",
    tag: 'Apothecary',
    keeper: 'apothecary',
    greeting: [
      'Potions for the bruised, elixirs for the brave.',
      'And bread, meat and water for the hungry. Keep your food and water up and you mend faster.',
      'Use them from the Inventory tab of your menu.',
    ],
    stock: ['potion', 'elixir', 'bread', 'roastMeat', 'apple', 'waterskin'],
    buys: isSupply,
  },
  wizard: {
    id: 'wizard',
    name: "Orlen's Sanctum",
    tag: 'Wizard',
    keeper: 'wizard',
    greeting: [
      'Wands for the quick, tomes for the patient.',
      'Tap the right arrows in the right order and the weapon does the rest.',
    ],
    stock: ['apprenticeWand', 'stormcallerWand', 'noviceTome', 'arcaneGrimoire'],
    buys: isCaster,
  },
};

/** Shop ids, for maps and tests. */
export const SHOP_IDS = Object.keys(SHOPS);

export type Trade = { ok: true; text: string; worn?: Item } | { ok: false; text: string };

/** What a shop has for sale in this campaign: no bread or waterskins where nobody gets hungry (systems/capabilities.ts). */
export function stockOf(shop: Pick<Shop, 'stock'>): readonly ItemId[] {
  if (enabledAnywhere('needs')) return shop.stock;
  return shop.stock.filter((id) => !onlyFeeds(ITEMS[id] as Item));
}

/**
 * Buy one of a shop's items. Gear that beats what the hero wears is put on (what it replaces goes into the pack);
 * anything else goes into the pack.
 */
export function buy(hero: Hero, shop: Shop, id: ItemId): Trade {
  const item: Item = ITEMS[id];
  if (!stockOf(shop).includes(id)) return { ok: false, text: `${shop.name} does not sell that` };
  const price = buyPrice(item);
  if (hero.gold < price) return { ok: false, text: `Not enough gold (${price - hero.gold} short)` };
  // Gear that beats what is worn goes on (the old piece takes a pack slot); anything else needs a free slot.
  const old = item.slot ? (item.slot === 'weapon' ? hero.weapon : hero[item.slot]) : undefined;
  const wears = item.slot !== undefined && isBetter(hero, item);
  if ((!wears || old) && !hasRoom(hero)) return { ok: false, text: 'Your pack is full' };
  hero.gold -= price;
  if (wears) {
    wearIfBetter(hero, item);
    return { ok: true, text: `Bought and wearing ${item.name}`, worn: item };
  }
  addToPack(hero, item);
  return { ok: true, text: `Bought ${item.name}` };
}

/** Sell one of `item` from the pack, if this shop deals in it. */
export function sell(hero: Hero, shop: Shop, item: Item): Trade {
  if (!shop.buys(item)) return { ok: false, text: `${shop.name} has no use for that` };
  if (!takeFromPack(hero, item)) return { ok: false, text: 'You do not have that' };
  const price = sellPrice(item);
  hero.gold += price;
  return { ok: true, text: `Sold ${item.name} for ${price}g` };
}
