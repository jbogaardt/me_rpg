import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { collect } from './chests';
import {
  addToPack,
  applyInvOp,
  applyLoadout,
  decodeOp,
  encodeOp,
  ITEM_COUNT,
  itemCode,
  itemFromCode,
  loadoutOf,
  sameLoadout,
  type InvOp,
  BASE_PACK,
  dropFromPack,
  dropWorn,
  equipFromPack,
  fitsSlot,
  packSize,
  slotsFor,
  unequip,
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

describe('inventory actions as data', () => {
  const ops: InvOp[] = [
    { t: 'equip', index: 3 },
    { t: 'equip', index: 0, slot: 'offhand' },
    { t: 'unequip', slot: 'cape' },
    { t: 'dropPack', index: 7 },
    { t: 'dropWorn', slot: 'bag' },
  ];

  it('survives the wire', () => {
    for (const op of ops) expect(decodeOp(encodeOp(op))).toEqual(op);
  });

  it('refuses junk from a peer', () => {
    for (const wire of [
      [9, 0, 0],
      [0, -1, -1],
      [0, 1.5, -1],
      [0, 1, 99],
      [1, 99, 0],
      [3, -1, 0],
      [2, 99, 0],
    ] as const) {
      expect(decodeOp([...wire]), wire.join()).toBeNull();
    }
  });

  it('does the action and hands back what was dropped', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.kettleHat);
    expect(applyInvOp(hero, { t: 'dropPack', index: 0 })).toEqual({ ok: true, dropped: ITEMS.kettleHat });
    expect(hero.pack).toEqual([]);
    expect(applyInvOp(hero, { t: 'dropWorn', slot: 'cape' })).toEqual({ ok: true, dropped: ITEMS.travelerCloak });
    expect(hero.cape).toBeUndefined();
  });

  it('changes nothing when an action fails', () => {
    const hero = newHero();
    for (const op of [
      { t: 'dropPack', index: 0 },
      { t: 'dropWorn', slot: 'weapon' },
      { t: 'unequip', slot: 'head' },
    ] as const) {
      expect(applyInvOp(hero, op).ok).toBe(false);
    }
    expect(hero).toEqual(newHero());
  });
});

describe('item codes and loadouts', () => {
  it('number every item from 1, and 0 means nothing', () => {
    expect(itemCode(undefined)).toBe(0);
    expect(itemFromCode(0)).toBeUndefined();
    expect(itemFromCode(ITEM_COUNT + 1)).toBeUndefined();
    for (const item of Object.values(ITEMS)) expect(itemFromCode(itemCode(item))).toBe(item);
  });

  it('copies what a hero wears and carries onto another', () => {
    const a = newHero();
    a.head = ITEMS.kettleHat;
    a.bag = ITEMS.sack;
    a.pack.push(ITEMS.steelSword, ITEMS.whetstone);
    delete a.cape;
    const b = newHero();
    expect(sameLoadout(loadoutOf(a), loadoutOf(b))).toBe(false);
    applyLoadout(b, loadoutOf(a));
    expect(sameLoadout(loadoutOf(a), loadoutOf(b))).toBe(true);
    expect(b.cape).toBeUndefined(); // an empty slot is cleared
    expect(b.pack).toEqual([ITEMS.steelSword, ITEMS.whetstone]);
    expect(b.weapon).toBe(ITEMS.rustySword);
  });
});
