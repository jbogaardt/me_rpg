import { describe, expect, it } from 'vitest';
import { MOB_KINDS, newHero, rollGold } from './combat';
import { NPC_LOOKS } from './looks';
import { BASE_PACK } from './inventory';
import { buy, buyPrice, SHOPS, sell, sellPrice, shopBuys } from './shops';
import { ITEMS, itemOf } from './items';

const smithy = SHOPS.smithy!;
const apothecary = SHOPS.apothecary!;

describe('SHOPS', () => {
  it('dress each shopkeeper in a known look and only stock priced, existing items', () => {
    for (const [id, shop] of Object.entries(SHOPS)) {
      expect(NPC_LOOKS[shop.keeper], id).toBeDefined();
      expect(shop.stock.length, id).toBeGreaterThan(0);
      for (const item of shop.stock) expect(buyPrice(itemOf(item)), `${id} ${item}`).toBeGreaterThan(0);
    }
  });

  it('are filed under their own id', () => {
    for (const [key, shop] of Object.entries(SHOPS)) expect(shop.id).toBe(key);
  });

  it('never sells the same thing from two shops', () => {
    const sold = Object.values(SHOPS).flatMap((s) => s.stock);
    expect(new Set(sold).size).toBe(sold.length);
  });

  it('buys back only what it sells the kind of', () => {
    expect(shopBuys(smithy, itemOf('steelSword'))).toBe(true);
    expect(shopBuys(smithy, itemOf('shortBow'))).toBe(false); // a bow is the ranger's
    expect(shopBuys(SHOPS.ranger!, itemOf('shortBow'))).toBe(true);
    expect(shopBuys(SHOPS.armory!, itemOf('greatHelm'))).toBe(true);
    expect(shopBuys(apothecary, itemOf('potion'))).toBe(true);
    expect(shopBuys(apothecary, itemOf('steelSword'))).toBe(false);
  });

  it('pays less than it charges', () => {
    for (const item of Object.values(ITEMS)) expect(sellPrice(item)).toBeLessThan(buyPrice(item));
  });
});

describe('buy', () => {
  it('takes the gold and wears gear that is an upgrade, keeping the old piece', () => {
    const hero = newHero();
    hero.gold = 100;
    const trade = buy(hero, smithy, 'bronzeSword');
    expect(trade).toMatchObject({ ok: true, worn: itemOf('bronzeSword') });
    expect(hero.gold).toBe(60);
    expect(hero.weapon).toBe(itemOf('bronzeSword'));
    expect(hero.pack).toEqual([itemOf('stick')]);
  });

  it('keeps gear that is no upgrade in the pack, without wearing it', () => {
    const hero = newHero();
    hero.gold = 200;
    buy(hero, smithy, 'steelSword');
    hero.gold = 100;
    const trade = buy(hero, smithy, 'bronzeSword');
    expect(trade.ok && trade.worn).toBeFalsy();
    expect(hero.weapon).toBe(itemOf('steelSword'));
    expect(hero.pack).toContain(itemOf('bronzeSword'));
  });

  it('puts supplies in the pack', () => {
    const hero = newHero();
    hero.gold = 30;
    expect(buy(hero, apothecary, 'potion').ok).toBe(true);
    expect(buy(hero, apothecary, 'potion').ok).toBe(true);
    expect(hero.pack).toEqual([itemOf('potion'), itemOf('potion')]);
    expect(hero.gold).toBe(0);
  });

  it('refuses when short of gold, changing nothing', () => {
    const hero = newHero();
    hero.gold = 39;
    const trade = buy(hero, smithy, 'bronzeSword');
    expect(trade).toEqual({ ok: false, text: 'Not enough gold (1 short)' });
    expect(hero.gold).toBe(39);
    expect(hero.weapon).toBe(itemOf('stick'));
  });

  it('refuses to buy with nowhere to put it, taking no gold', () => {
    const hero = newHero();
    hero.gold = 500;
    hero.pack.push(...Array.from({ length: BASE_PACK }, () => itemOf('potion')));
    expect(buy(hero, apothecary, 'potion')).toEqual({ ok: false, text: 'Your pack is full' });
    expect(buy(hero, smithy, 'bronzeSword')).toEqual({ ok: false, text: 'Your pack is full' }); // the old sword would need a slot
    expect(hero.gold).toBe(500);
    hero.head = undefined;
    expect(buy(hero, SHOPS.armory!, 'clothHood').ok).toBe(true); // an empty slot needs no room
  });

  it('refuses what the shop does not stock', () => {
    const hero = newHero();
    hero.gold = 1000;
    expect(buy(hero, smithy, 'potion').ok).toBe(false);
    expect(hero.gold).toBe(1000);
  });
});

describe('sell', () => {
  it('pays out and removes the item from the pack', () => {
    const hero = newHero();
    hero.pack.push(itemOf('steelSword'), itemOf('steelSword'));
    const trade = sell(hero, smithy, itemOf('steelSword'));
    expect(trade).toEqual({ ok: true, text: 'Sold Steel Sword for 60g' });
    expect(hero.gold).toBe(60);
    expect(hero.pack).toEqual([itemOf('steelSword')]);
  });

  it('does not buy another trade, or what the hero does not have, or what is worn', () => {
    const hero = newHero();
    hero.pack.push(itemOf('potion'));
    expect(sell(hero, smithy, itemOf('potion')).ok).toBe(false);
    expect(sell(hero, smithy, itemOf('steelSword')).ok).toBe(false);
    expect(sell(hero, smithy, itemOf('stick')).ok).toBe(false); // worn, not in the pack
    expect(hero.gold).toBe(0);
    expect(hero.pack).toEqual([itemOf('potion')]);
  });
});

describe('gold from enemies', () => {
  it('drops within 30% of the usual, and at least 1', () => {
    for (const kind of Object.values(MOB_KINDS)) {
      for (let i = 0; i < 20; i++) {
        const gold = rollGold(kind);
        expect(gold).toBeGreaterThanOrEqual(Math.max(1, Math.floor(kind.gold * 0.7)));
        expect(gold).toBeLessThanOrEqual(Math.ceil(kind.gold * 1.3));
      }
    }
  });

  it('pays more for tougher enemies', () => {
    const order = Object.values(MOB_KINDS).sort((a, b) => a.xp - b.xp);
    for (let i = 1; i < order.length; i++) expect(order[i]!.gold).toBeGreaterThanOrEqual(order[i - 1]!.gold);
  });
});
