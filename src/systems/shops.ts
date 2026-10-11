// Shops: who sells what, at what price, and the rules of buying and selling. Pure; the Pixi side places the
// shopkeepers (OverworldScene) and the HTML side draws the counter (hud/ShopCounter.ts). A map places a shopkeeper with
// `z.shop(id, col, row)` (see the build-zone skill) and the building behind them with `z.prop('smithy', ...)`.
//
// Each shop is a specialist: it sells a few kinds of things and only buys those kinds back. Money comes mostly from
// enemies (see `MobKind.gold`); chests hold the odd purse and the gear that no shop stocks. What is bought goes through
// the same pack as everything else (systems/inventory.ts), so it obeys the pack's size.

import type { GearSlot, Hero, Item } from './combat';
import { addToPack, equipFromPack, hasRoom, isBetter } from './inventory';
import { ITEMS, type ItemId } from './items';

/** A shop pays this share of an item's value when buying it back. */
export const SELL_RATE = 0.4;

export const buyPrice = (item: Item): number => item.value ?? 0;
export const sellPrice = (item: Item): number => Math.max(1, Math.floor((item.value ?? 0) * SELL_RATE));

export interface Shop {
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
const isBlade = (item: Item) => item.slot === 'weapon' && !isBow(item);
const isSupply = (item: Item) => item.use !== undefined;

export const SHOPS: Record<string, Shop> = {
  smithy: {
    name: "Brannoch's Forge",
    tag: 'Blacksmith',
    keeper: 'smith',
    greeting: ['Steel and iron, fresh from the fire.', 'Blades and shields: that is my trade.'],
    stock: ['bronzeSword', 'steelSword', 'silverSword', 'woodenShield', 'ironShield', 'kiteShield'],
    buys: (item) => isBlade(item) || isSlot('offhand')(item),
  },
  armory: {
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
    name: "Wren's Apothecary",
    tag: 'Apothecary',
    keeper: 'apothecary',
    greeting: ['Potions for the bruised, elixirs for the brave.', 'Drink them from the Inventory tab of your menu.'],
    stock: ['potion', 'elixir'],
    buys: (item) => isSupply(item) || isSlot('tool')(item), // bandages and the like
  },
};

/** Shop ids, for maps and tests. */
export const SHOP_IDS = Object.keys(SHOPS);

export type Trade = { ok: true; text: string; worn?: Item } | { ok: false; text: string };

/**
 * Buy one of a shop's items. It goes into the pack, and gear that beats what the hero wears is put on from there (the
 * piece it replaces stays in the pack). A full pack refuses the sale.
 */
export function buy(hero: Hero, shop: Shop, id: ItemId): Trade {
  const item: Item = ITEMS[id];
  if (!shop.stock.includes(id)) return { ok: false, text: `${shop.name} does not sell that` };
  const price = buyPrice(item);
  if (hero.gold < price) return { ok: false, text: `Not enough gold (${price - hero.gold} short)` };
  if (!hasRoom(hero)) return { ok: false, text: 'Your pack is full' };
  const upgrade = item.slot !== undefined && isBetter(hero, item);
  addToPack(hero, item);
  hero.gold -= price;
  // The old piece takes the new one's place in the pack, so wearing never needs more room than the purchase did.
  if (upgrade && equipFromPack(hero, hero.pack.length - 1).ok) {
    return { ok: true, text: `Bought and wearing ${item.name}`, worn: item };
  }
  return { ok: true, text: `Bought ${item.name}` };
}

/** Sell the item at `index` in the pack, if this shop deals in it. */
export function sell(hero: Hero, shop: Shop, index: number): Trade {
  const item = hero.pack[index];
  if (!item) return { ok: false, text: 'You do not have that' };
  if (!shop.buys(item)) return { ok: false, text: `${shop.name} has no use for that` };
  hero.pack.splice(index, 1);
  const price = sellPrice(item);
  hero.gold += price;
  return { ok: true, text: `Sold ${item.name} for ${price}g` };
}
