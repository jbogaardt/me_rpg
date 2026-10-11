import { describe, expect, it, vi } from 'vitest';
import { newHero } from './combat';
import { itemCode } from './inventory';
import { ITEMS } from './items';
import { SHOPS } from './shops';
import { localTrader, remoteTrader, type TradeRequest } from './trader';

describe('localTrader', () => {
  it('buys, reporting that the sprite needs redrawing when gear went on', () => {
    const hero = newHero();
    hero.gold = 100;
    const out = localTrader(hero).buy(SHOPS.smithy!, ITEMS.bronzeSword);
    expect(out).toMatchObject({ ok: true, gear: true });
    expect(hero.gold).toBe(60);
    expect(localTrader(hero).buy(SHOPS.smithy!, ITEMS.silverSword)).toMatchObject({ ok: false });
    expect(localTrader(hero).buy(SHOPS.smithy!, ITEMS.potion)).toMatchObject({ ok: false }); // not in stock
  });

  it('sells, wears and drinks from the pack', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.steelSword, ITEMS.potion);
    const trader = localTrader(hero);
    expect(trader.sell(SHOPS.smithy!, ITEMS.steelSword)).toMatchObject({ ok: true });
    expect(hero.gold).toBe(60);
    expect(trader.wear(ITEMS.steelSword)).toMatchObject({ ok: false }); // sold already
    hero.stats.hp = 1;
    expect(trader.use(ITEMS.potion)).toMatchObject({ ok: true, text: '+20 HP' });
    expect(trader.use(ITEMS.potion)).toMatchObject({ ok: false });
  });
});

describe('remoteTrader', () => {
  it('only asks, and leaves the answer to the host', () => {
    const send = vi.fn<(request: TradeRequest) => void>();
    const trader = remoteTrader(send);
    expect(trader.buy(SHOPS.armory!, ITEMS.greatHelm)).toBeNull();
    expect(trader.sell(SHOPS.armory!, ITEMS.greatHelm)).toBeNull();
    expect(trader.wear(ITEMS.greatHelm)).toBeNull();
    expect(trader.use(ITEMS.potion)).toBeNull();
    expect(send.mock.calls.map(([r]) => r)).toEqual([
      { op: 'buy', item: itemCode(ITEMS.greatHelm), shop: 'armory' },
      { op: 'sell', item: itemCode(ITEMS.greatHelm), shop: 'armory' },
      { op: 'wear', item: itemCode(ITEMS.greatHelm), shop: '' },
      { op: 'use', item: itemCode(ITEMS.potion), shop: '' },
    ]);
  });
});
