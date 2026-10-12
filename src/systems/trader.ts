// Who carries out a purchase, a sale, putting a piece on or drinking a potion. In solo and on a host's own machine the
// machine itself does it (`localTrader`); on a co-op guest's the host owns the gold and the pack, so the guest only
// asks (`remoteTrader`) and the answer arrives with the host's next update of the pack. The menu and the shop counter
// are written against this one interface and do not know which they have.

import type { Hero, Item } from './combat';
import { ITEM_IDS, itemCode, useFromPack, wearFromPack } from './inventory';
import { buy, sell, type Shop } from './shops';

/** What happened, in words for the player. `gear` is set when what the hero wears changed (the sprite must be redrawn). */
export interface Outcome {
  ok: boolean;
  text: string;
  gear?: boolean;
  /** Set on the answer to a `talk`: the quest lines to read (systems/quests.ts `linesFor`). */
  story?: string;
}

export type TradeRequest = { op: 'buy' | 'sell' | 'wear' | 'use' | 'talk'; item: number; shop: string };

export interface Trader {
  /** Each returns the outcome at once, or null when the host decides and will answer later. */
  buy(shop: Shop, item: Item): Outcome | null;
  sell(shop: Shop, item: Item): Outcome | null;
  wear(item: Item): Outcome | null;
  use(item: Item): Outcome | null;
}

export function localTrader(hero: Hero): Trader {
  return {
    buy(shop, item) {
      const id = ITEM_IDS[itemCode(item) - 1];
      if (!id) return { ok: false, text: 'That is not for sale' };
      const trade = buy(hero, shop, id);
      return { ok: trade.ok, text: trade.text, gear: trade.ok && trade.worn !== undefined };
    },
    sell(shop, item) {
      const trade = sell(hero, shop, item);
      return { ok: trade.ok, text: trade.text };
    },
    wear(item) {
      const result = wearFromPack(hero, item);
      return result.ok ? { ok: true, text: `Wearing ${item.name}`, gear: true } : { ok: false, text: result.reason };
    },
    use(item) {
      const used = useFromPack(hero, item);
      return used ? { ok: true, text: used.text } : { ok: false, text: 'You do not need that right now' };
    },
  };
}

/** A guest's trader: it sends each wish to the host and shows nothing itself. */
export function remoteTrader(send: (request: TradeRequest) => void): Trader {
  const ask = (op: TradeRequest['op'], item: Item, shop = ''): null => {
    send({ op, item: itemCode(item), shop });
    return null;
  };
  return {
    buy: (shop, item) => ask('buy', item, shop.id),
    sell: (shop, item) => ask('sell', item, shop.id),
    wear: (item) => ask('wear', item),
    use: (item) => ask('use', item),
  };
}
