// Shops: who sells what, at what price, and the rules of buying and selling. Pure; the Pixi side places the
// shopkeepers (OverworldScene) and the HTML side draws the counter (hud/Shop.ts). A map places a shopkeeper with
// `z.shop(id, col, row)` (see the build-zone skill) and the building behind them with `z.prop('smithy', ...)`.
//
// Each shop is a specialist: it sells a few kinds of things and only buys those kinds back (the wizard: wands and tomes). Money comes mostly from
// enemies (see `MobKind.gold`); chests hold the odd purse and the gear that no shop stocks.

import { enabledAnywhere } from './capabilities';
import { isGem } from './gems';
import { onlyFeeds } from './needs';
import type { Hero, Item } from './combat';
import { addToPack, hasRoom, isBetter, takeFromPack, wearIfBetter } from './inventory';
import { itemOf, type ItemId } from './items';

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
  /** Who stands at the counter: an npc entity (NPC_LOOKS, systems/looks.ts). */
  keeper: string;
  /** What the shopkeeper says before the counter opens. */
  greeting: string[];
  /** What it sells, in the order shown. */
  stock: readonly ItemId[];
  /** What it buys back from the pack (only its own trade): gear slots and kinds (`TRADE_KINDS`), any of them. */
  buys: readonly string[];
}

/** Kinds of goods a shop can buy back, besides a gear slot: plain weapons, bows, wands and tomes, supplies, gems. */
export const TRADE_KINDS = ['blade', 'bow', 'caster', 'supply', 'gem'] as const;

const isBow = (item: Item) => item.ranged !== undefined;
const isCaster = (item: Item) => item.focus !== undefined;
const KIND_TEST: Record<(typeof TRADE_KINDS)[number], (item: Item) => boolean> = {
  blade: (item) => item.slot === 'weapon' && !isBow(item) && !isCaster(item),
  bow: isBow,
  caster: isCaster,
  supply: (item) => item.use !== undefined,
  gem: isGem,
};

/** Does a shop buy this item back? A slot in `buys` takes anything worn there (`weapon` every weapon). */
export function shopBuys(shop: Pick<Shop, 'buys'>, item: Item): boolean {
  return shop.buys.some((what) => {
    const test = KIND_TEST[what as keyof typeof KIND_TEST] as ((item: Item) => boolean) | undefined;
    return test ? test(item) : item.slot === what;
  });
}

/** The campaign's shops by id (content: items.json `shops`; empty until it is installed). */
export const SHOPS: Record<string, Shop> = {};

export function setShops(shops: Record<string, Shop>) {
  for (const id of Object.keys(SHOPS)) delete SHOPS[id];
  Object.assign(SHOPS, shops);
}

export type Trade = { ok: true; text: string; worn?: Item } | { ok: false; text: string };

/** What a shop has for sale in this campaign: no bread or waterskins where nobody gets hungry, no gems where none can be set (systems/capabilities.ts). */
export function stockOf(shop: Pick<Shop, 'stock'>): readonly ItemId[] {
  return shop.stock.filter(
    (id) => (enabledAnywhere('needs') || !onlyFeeds(itemOf(id))) && (enabledAnywhere('forge') || !isGem(itemOf(id))),
  );
}

/**
 * Buy one of a shop's items. Gear that beats what the hero wears is put on (what it replaces goes into the pack);
 * anything else goes into the pack.
 */
export function buy(hero: Hero, shop: Shop, id: ItemId): Trade {
  if (!stockOf(shop).includes(id)) return { ok: false, text: `${shop.name} does not sell that` };
  const item = itemOf(id);
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
  if (!shopBuys(shop, item)) return { ok: false, text: `${shop.name} has no use for that` };
  if (!takeFromPack(hero, item)) return { ok: false, text: 'You do not have that' };
  const price = sellPrice(item);
  hero.gold += price;
  return { ok: true, text: `Sold ${item.name} for ${price}g` };
}
