import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { collect } from './chests';
import {
  addToPack,
  BASE_PACK,
  dropFromPack,
  dropWorn,
  equipFromPack,
  fitsSlot,
  isBetter,
  packSize,
  slotsFor,
  unequip,
  useFromPack,
} from './inventory';
import { ITEMS } from './items';
import { playerOutfit } from './looks';

const filled = (n: number) => {
  const hero = newHero();
  for (let i = 0; i < n; i++) expect(addToPack(hero, ITEMS.clothHood)).toBe(true);
  return hero;
};

describe('pack size', () => {
  it('starts at 10 and refuses an eleventh item', () => {
    const hero = filled(BASE_PACK);
    expect(packSize(hero)).toBe(10);
    expect(addToPack(hero, ITEMS.nasalHelm)).toBe(false);
    expect(hero.pack).toHaveLength(10);
  });

  it('grows with a worn bag', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.backpack);
    expect(equipFromPack(hero, 0)).toEqual({ ok: true });
    expect(hero.bag).toBe(ITEMS.backpack);
    expect(packSize(hero)).toBe(18);
  });

  it('will not take off a bag while the pack needs the room', () => {
    const hero = newHero();
    hero.bag = ITEMS.sack;
    for (let i = 0; i < 12; i++) addToPack(hero, ITEMS.clothHood);
    const r = unequip(hero, 'bag');
    expect(r.ok).toBe(false);
    expect(hero.bag).toBe(ITEMS.sack);
    expect(dropWorn(hero, 'bag').ok).toBe(false);
  });

  it('takes off a bag when everything still fits', () => {
    const hero = newHero();
    hero.bag = ITEMS.sack;
    hero.pack.push(ITEMS.clothHood);
    expect(unequip(hero, 'bag')).toEqual({ ok: true });
    expect(hero.bag).toBeUndefined();
    expect(hero.pack).toContain(ITEMS.sack);
  });

  it('will not swap to a smaller bag that cannot hold the pack', () => {
    const hero = newHero();
    hero.bag = ITEMS.backpack;
    for (let i = 0; i < 16; i++) addToPack(hero, ITEMS.clothHood);
    hero.pack[0] = ITEMS.sack;
    expect(equipFromPack(hero, 0).ok).toBe(false);
    expect(hero.bag).toBe(ITEMS.backpack);
  });
});

describe('equipping from the pack', () => {
  it('swaps with what is worn', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.steelSword);
    equipFromPack(hero, 0);
    expect(hero.weapon).toBe(ITEMS.steelSword);
    expect(hero.pack).toEqual([ITEMS.rustySword]);
  });

  it('wears a one-handed weapon in either hand, but not a bow in the off-hand', () => {
    expect(fitsSlot(ITEMS.bronzeSword, 'offhand')).toBe(true);
    expect(fitsSlot(ITEMS.bronzeSword, 'weapon')).toBe(true);
    expect(fitsSlot(ITEMS.shortBow, 'offhand')).toBe(false);
    expect(slotsFor(ITEMS.bronzeSword)).toEqual(['weapon', 'offhand']);
    const hero = newHero();
    hero.pack.push(ITEMS.bronzeSword, ITEMS.shortBow);
    expect(equipFromPack(hero, 0, 'offhand')).toEqual({ ok: true });
    expect(hero.offhand).toBe(ITEMS.bronzeSword);
    expect(hero.weapon).toBe(ITEMS.rustySword);
    expect(equipFromPack(hero, 0, 'offhand').ok).toBe(false);
  });

  it('adds the off-hand blade to attack without hiding the main weapon on the doll', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.bronzeSword);
    const before = playerOutfit(0, hero);
    equipFromPack(hero, 0, 'offhand');
    expect(playerOutfit(0, hero)).toEqual(before);
  });

  it('refuses an item in the wrong slot and a missing item', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.kettleHat);
    expect(equipFromPack(hero, 0, 'feet').ok).toBe(false);
    expect(equipFromPack(hero, 5).ok).toBe(false);
    expect(hero.pack).toEqual([ITEMS.kettleHat]);
  });

  it('wears tools', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.whetstone);
    equipFromPack(hero, 0);
    expect(hero.tool).toBe(ITEMS.whetstone);
  });
});

describe('taking off and dropping', () => {
  it('moves worn gear to the pack, but never the weapon', () => {
    const hero = newHero();
    expect(unequip(hero, 'cape')).toEqual({ ok: true });
    expect(hero.cape).toBeUndefined();
    expect(hero.pack).toEqual([ITEMS.travelerCloak]);
    expect(unequip(hero, 'weapon').ok).toBe(false);
    expect(unequip(hero, 'head').ok).toBe(false);
  });

  it('will not take off into a full pack', () => {
    const hero = filled(BASE_PACK);
    expect(unequip(hero, 'cape').ok).toBe(false);
    expect(hero.cape).toBe(ITEMS.travelerCloak);
  });

  it('drops from the pack and from the body, which frees the slot', () => {
    const hero = filled(2);
    expect(dropFromPack(hero, 0)).toBe(ITEMS.clothHood);
    expect(hero.pack).toHaveLength(1);
    expect(dropWorn(hero, 'cape')).toEqual({ ok: true, item: ITEMS.travelerCloak });
    expect(hero.cape).toBeUndefined();
    expect(dropWorn(hero, 'weapon').ok).toBe(false);
  });
});

describe('chest loot', () => {
  it('wears gear for an empty slot or an upgrade, packs the rest, and leaves the chest shut when the pack is full', () => {
    const hero = newHero();
    expect(collect(hero, { item: ITEMS.kettleHat }).gear).toBe(ITEMS.kettleHat);
    expect(collect(hero, { item: ITEMS.greatHelm }).gear).toBe(ITEMS.greatHelm); // better: worn
    expect(hero.pack).toEqual([ITEMS.kettleHat]); // the old piece is kept
    expect(collect(hero, { item: ITEMS.clothHood }).gear).toBeUndefined(); // worse: packed
    expect(hero.head).toBe(ITEMS.greatHelm);
    expect(hero.pack).toContain(ITEMS.clothHood);
  });

  it('refuses gear it has nowhere to keep', () => {
    const full = filled(BASE_PACK);
    full.head = ITEMS.kettleHat;
    expect(collect(full, { item: ITEMS.greatHelm })).toMatchObject({ refused: true });
    expect(collect(full, { item: ITEMS.nasalHelm })).toMatchObject({ refused: true });
    expect(full.head).toBe(ITEMS.kettleHat);
    expect(full.pack).toHaveLength(BASE_PACK);
    full.head = undefined;
    expect(collect(full, { item: ITEMS.nasalHelm }).gear).toBe(ITEMS.nasalHelm); // empty slot: no room needed
  });

  it('keeps the old upgrade-only rule for players without a pack screen', () => {
    const hero = newHero();
    hero.head = ITEMS.kettleHat;
    expect(collect(hero, { item: ITEMS.clothHood }, false).gear).toBeUndefined();
    expect(collect(hero, { item: ITEMS.greatHelm }, false).gear).toBe(ITEMS.greatHelm);
    expect(hero.pack).toEqual([]);
  });
});

describe('useFromPack', () => {
  it('drinks a supply: it leaves the pack and heals, capped at the maximum', () => {
    const hero = newHero();
    hero.stats.hp = 10;
    hero.pack.push(ITEMS.potion);
    expect(useFromPack(hero, 0)).toMatchObject({ ok: true, text: '+20 HP' });
    expect(hero.stats.hp).toBe(30);
    expect(hero.pack).toHaveLength(0);
  });

  it('restores MP too for an elixir', () => {
    const hero = newHero();
    hero.stats.mp = 0;
    hero.pack.push(ITEMS.elixir);
    expect(useFromPack(hero, 0)).toMatchObject({ ok: true, text: 'HP and MP restored' });
    expect(hero.stats.mp).toBe(hero.stats.maxMp);
  });

  it('keeps the supply when it would do nothing, and refuses gear', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.potion, ITEMS.steelSword);
    expect(useFromPack(hero, 0)).toMatchObject({ ok: false });
    expect(useFromPack(hero, 1)).toMatchObject({ ok: false });
    expect(useFromPack(hero, 5)).toMatchObject({ ok: false });
    expect(hero.pack).toHaveLength(2);
  });
});

describe('isBetter', () => {
  it('compares against the worn piece, and an empty slot takes anything', () => {
    const hero = newHero();
    expect(isBetter(hero, ITEMS.bronzeSword)).toBe(true); // rusty sword is worse
    expect(isBetter(hero, ITEMS.rustySword)).toBe(false);
    expect(isBetter(hero, ITEMS.greatHelm)).toBe(true); // no helm yet
    expect(isBetter(hero, ITEMS.potion)).toBe(false); // not gear
  });
});
