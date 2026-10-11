import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import {
  bagCodes,
  gearCodes,
  isBetter,
  ITEM_IDS,
  itemCode,
  itemFromCode,
  packEntries,
  setBag,
  setGear,
  upgrade,
  useFromPack,
  wear,
  wearFromPack,
} from './inventory';
import { ITEMS } from './items';

describe('wear', () => {
  it('puts the old piece in the pack', () => {
    const hero = newHero();
    wear(hero, ITEMS.bronzeSword);
    expect(hero.weapon).toBe(ITEMS.bronzeSword);
    expect(hero.bag).toEqual([ITEMS.rustySword]);
  });

  it('keeps an empty slot from adding anything to the pack', () => {
    const hero = newHero();
    wear(hero, ITEMS.clothHood);
    expect(hero.head).toBe(ITEMS.clothHood);
    expect(hero.bag).toEqual([]);
  });

  it('puts a piece back on from the pack, swapping with what is worn', () => {
    const hero = newHero();
    wear(hero, ITEMS.bronzeSword);
    expect(wearFromPack(hero, ITEMS.rustySword)).toBe(true);
    expect(hero.weapon).toBe(ITEMS.rustySword);
    expect(hero.bag).toEqual([ITEMS.bronzeSword]);
    expect(wearFromPack(hero, ITEMS.steelSword)).toBe(false); // not in the pack
    expect(wearFromPack(hero, ITEMS.potion)).toBe(false); // not wearable
  });
});

describe('isBetter and upgrade', () => {
  it('compares against the worn piece in the same slot', () => {
    const hero = newHero();
    expect(isBetter(hero, ITEMS.steelSword)).toBe(true);
    expect(isBetter(hero, ITEMS.rustySword)).toBe(false);
    expect(upgrade(hero, ITEMS.steelSword)).toBe(3);
    expect(upgrade(hero, ITEMS.clothHood)).toBe(1); // an empty slot is worth nothing
    expect(upgrade(hero, ITEMS.potion)).toBe(0);
  });
});

describe('packEntries', () => {
  it('groups the same item and keeps first-seen order', () => {
    const hero = newHero();
    hero.bag.push(ITEMS.potion, ITEMS.bronzeSword, ITEMS.potion);
    expect(packEntries(hero)).toEqual([
      { item: ITEMS.potion, count: 2 },
      { item: ITEMS.bronzeSword, count: 1 },
    ]);
  });
});

describe('useFromPack', () => {
  it('drinks a supply and uses it up', () => {
    const hero = newHero();
    hero.bag.push(ITEMS.potion, ITEMS.potion);
    hero.stats.hp = 5;
    expect(useFromPack(hero, ITEMS.potion)?.text).toBe('+20 HP');
    expect(hero.stats.hp).toBe(25);
    expect(hero.bag).toEqual([ITEMS.potion]);
  });

  it('does not waste a supply on someone who needs nothing', () => {
    const hero = newHero();
    hero.bag.push(ITEMS.potion);
    expect(useFromPack(hero, ITEMS.potion)).toBeNull();
    expect(hero.bag).toHaveLength(1);
  });

  it('restores MP too with an elixir, even at full HP', () => {
    const hero = newHero();
    hero.bag.push(ITEMS.elixir);
    hero.stats.mp = 0;
    expect(useFromPack(hero, ITEMS.elixir)).not.toBeNull();
    expect(hero.stats.mp).toBe(hero.stats.maxMp);
  });

  it('refuses gear and things not in the pack', () => {
    const hero = newHero();
    hero.bag.push(ITEMS.bronzeSword);
    hero.stats.hp = 1;
    expect(useFromPack(hero, ITEMS.bronzeSword)).toBeNull();
    expect(useFromPack(hero, ITEMS.elixir)).toBeNull();
  });
});

describe('item codes', () => {
  it('give every item its own code, and 0 means nothing', () => {
    const codes = Object.values(ITEMS).map(itemCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Math.min(...codes)).toBe(1);
    expect(Math.max(...codes)).toBe(ITEM_IDS.length);
    for (const item of Object.values(ITEMS)) expect(itemFromCode(itemCode(item))).toBe(item);
    expect(itemFromCode(0)).toBeUndefined();
    expect(itemFromCode(ITEM_IDS.length + 1)).toBeUndefined();
  });

  it("carry a hero's gear and pack to a copy of them", () => {
    const hero = newHero();
    wear(hero, ITEMS.steelSword);
    wear(hero, ITEMS.greatHelm);
    hero.bag.push(ITEMS.potion, ITEMS.potion);
    const copy = newHero();
    copy.cape = undefined; // the copy starts with something else on
    setGear(copy, gearCodes(hero));
    setBag(copy, bagCodes(hero));
    expect(copy).toMatchObject({ weapon: ITEMS.steelSword, head: ITEMS.greatHelm, cape: ITEMS.travelerCloak });
    expect(copy.bag).toEqual(hero.bag);
  });

  it('take pieces off that the host says are gone, but never leave the hero unarmed', () => {
    const hero = newHero();
    wear(hero, ITEMS.clothHood);
    setGear(hero, [0, 0, 0, 0, 0, 0, 0]);
    expect(hero.head).toBeUndefined();
    expect(hero.cape).toBeUndefined();
    expect(hero.weapon).toBe(ITEMS.rustySword);
  });
});
