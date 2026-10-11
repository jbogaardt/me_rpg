import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, newHero } from './combat';
import { collect } from './chests';
import {
  addToPack,
  BASE_PACK,
  dropFromPack,
  dropWorn,
  equipFromPack,
  fitsSlot,
  packSize,
  slotsFor,
  unequip,
  gearCodes,
  isBetter,
  ITEM_IDS,
  itemCode,
  itemFromCode,
  packCodes,
  packEntries,
  setGear,
  setPack,
  upgrade,
  useFromPack,
  wearFromPack,
  wearIfBetter,
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
});

const GEAR_NONE = GEAR_SLOTS.map(() => 0);

describe('wearIfBetter', () => {
  it('puts a better piece on and sends the old one to the pack', () => {
    const hero = newHero();
    expect(wearIfBetter(hero, ITEMS.bronzeSword)).toBe(true);
    expect(hero.weapon).toBe(ITEMS.bronzeSword);
    expect(hero.pack).toEqual([ITEMS.rustySword]);
  });

  it('fills an empty slot without touching the pack, and leaves a worse piece alone', () => {
    const hero = newHero();
    expect(wearIfBetter(hero, ITEMS.clothHood)).toBe(true);
    expect(hero.head).toBe(ITEMS.clothHood);
    expect(hero.pack).toEqual([]);
    expect(wearIfBetter(hero, ITEMS.clothHood)).toBe(false);
    expect(wearIfBetter(hero, ITEMS.potion)).toBe(false);
  });
});

describe('wearFromPack', () => {
  it('wears a piece from the pack, swapping with what is worn', () => {
    const hero = newHero();
    hero.weapon = ITEMS.bronzeSword;
    hero.pack.push(ITEMS.rustySword);
    expect(wearFromPack(hero, ITEMS.rustySword)).toEqual({ ok: true });
    expect(hero.weapon).toBe(ITEMS.rustySword);
    expect(hero.pack).toEqual([ITEMS.bronzeSword]);
    expect(wearFromPack(hero, ITEMS.steelSword).ok).toBe(false); // not in the pack
    hero.pack.push(ITEMS.potion);
    expect(wearFromPack(hero, ITEMS.potion).ok).toBe(false); // not wearable
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
    hero.pack.push(ITEMS.potion, ITEMS.bronzeSword, ITEMS.potion);
    expect(packEntries(hero)).toEqual([
      { item: ITEMS.potion, count: 2 },
      { item: ITEMS.bronzeSword, count: 1 },
    ]);
  });
});

describe('useFromPack', () => {
  it('drinks a supply and uses it up', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.potion, ITEMS.potion);
    hero.stats.hp = 5;
    expect(useFromPack(hero, ITEMS.potion)?.text).toBe('+20 HP');
    expect(hero.stats.hp).toBe(25);
    expect(hero.pack).toEqual([ITEMS.potion]);
  });

  it('does not waste a supply on someone who needs nothing', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.potion);
    expect(useFromPack(hero, ITEMS.potion)).toBeNull();
    expect(hero.pack).toHaveLength(1);
  });

  it('restores MP too with an elixir, even at full HP', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.elixir);
    hero.stats.mp = 0;
    expect(useFromPack(hero, ITEMS.elixir)).not.toBeNull();
    expect(hero.stats.mp).toBe(hero.stats.maxMp);
  });

  it('refuses gear and things not in the pack', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.bronzeSword);
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
    wearIfBetter(hero, ITEMS.steelSword);
    wearIfBetter(hero, ITEMS.greatHelm);
    hero.bag = ITEMS.sack;
    hero.pack.push(ITEMS.potion, ITEMS.potion);
    const copy = newHero();
    copy.cape = undefined; // the copy starts with something else on
    setGear(copy, gearCodes(hero));
    setPack(copy, packCodes(hero));
    expect(copy).toMatchObject({
      weapon: ITEMS.steelSword,
      head: ITEMS.greatHelm,
      cape: ITEMS.travelerCloak,
      bag: ITEMS.sack,
    });
    expect(copy.pack).toEqual(hero.pack);
  });

  it('take pieces off that the host says are gone, but never leave the hero unarmed', () => {
    const hero = newHero();
    wearIfBetter(hero, ITEMS.clothHood);
    setGear(hero, GEAR_NONE);
    expect(hero.head).toBeUndefined();
    expect(hero.cape).toBeUndefined();
    expect(hero.weapon).toBe(ITEMS.rustySword);
  });
});
