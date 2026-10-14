import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, newHero } from './combat';
import { collect } from './chests';
import {
  addToPack,
  applyInvOp,
  decodeOp,
  encodeOp,
  GROUND_LIFETIME,
  GROUND_WARNING,
  groundFading,
  groundRemaining,
  type InvOp,
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
  itemCount,
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
import { ITEMS, itemOf } from './items';
import { playerOutfit } from './looks';

const filled = (n: number) => {
  const hero = newHero();
  for (let i = 0; i < n; i++) expect(addToPack(hero, itemOf('clothHood'))).toBe(true);
  return hero;
};

describe('pack size', () => {
  it('starts at 10 and refuses an eleventh item', () => {
    const hero = filled(BASE_PACK);
    expect(packSize(hero)).toBe(10);
    expect(addToPack(hero, itemOf('nasalHelm'))).toBe(false);
    expect(hero.pack).toHaveLength(10);
  });

  it('grows with a worn bag', () => {
    const hero = newHero();
    hero.pack.push(itemOf('backpack'));
    expect(equipFromPack(hero, 0)).toEqual({ ok: true });
    expect(hero.bag).toBe(itemOf('backpack'));
    expect(packSize(hero)).toBe(18);
  });

  it('will not take off a bag while the pack needs the room', () => {
    const hero = newHero();
    hero.bag = itemOf('sack');
    for (let i = 0; i < 12; i++) addToPack(hero, itemOf('clothHood'));
    const r = unequip(hero, 'bag');
    expect(r.ok).toBe(false);
    expect(hero.bag).toBe(itemOf('sack'));
    expect(dropWorn(hero, 'bag').ok).toBe(false);
  });

  it('takes off a bag when everything still fits', () => {
    const hero = newHero();
    hero.bag = itemOf('sack');
    hero.pack.push(itemOf('clothHood'));
    expect(unequip(hero, 'bag')).toEqual({ ok: true });
    expect(hero.bag).toBeUndefined();
    expect(hero.pack).toContain(itemOf('sack'));
  });

  it('will not swap to a smaller bag that cannot hold the pack', () => {
    const hero = newHero();
    hero.bag = itemOf('backpack');
    for (let i = 0; i < 16; i++) addToPack(hero, itemOf('clothHood'));
    hero.pack[0] = itemOf('sack');
    expect(equipFromPack(hero, 0).ok).toBe(false);
    expect(hero.bag).toBe(itemOf('backpack'));
  });
});

describe('equipping from the pack', () => {
  it('swaps with what is worn', () => {
    const hero = newHero();
    hero.pack.push(itemOf('steelSword'));
    equipFromPack(hero, 0);
    expect(hero.weapon).toBe(itemOf('steelSword'));
    expect(hero.pack).toEqual([itemOf('rustySword')]);
  });

  it('wears a one-handed weapon in either hand, but not a bow in the off-hand', () => {
    expect(fitsSlot(itemOf('bronzeSword'), 'offhand')).toBe(true);
    expect(fitsSlot(itemOf('bronzeSword'), 'weapon')).toBe(true);
    expect(fitsSlot(itemOf('shortBow'), 'offhand')).toBe(false);
    expect(slotsFor(itemOf('bronzeSword'))).toEqual(['weapon', 'offhand']);
    const hero = newHero();
    hero.pack.push(itemOf('bronzeSword'), itemOf('shortBow'));
    expect(equipFromPack(hero, 0, 'offhand')).toEqual({ ok: true });
    expect(hero.offhand).toBe(itemOf('bronzeSword'));
    expect(hero.weapon).toBe(itemOf('rustySword'));
    expect(equipFromPack(hero, 0, 'offhand').ok).toBe(false);
  });

  it('adds the off-hand blade to attack without hiding the main weapon on the doll', () => {
    const hero = newHero();
    hero.pack.push(itemOf('bronzeSword'));
    const before = playerOutfit(0, hero);
    equipFromPack(hero, 0, 'offhand');
    expect(playerOutfit(0, hero)).toEqual(before);
  });

  it('refuses an item in the wrong slot and a missing item', () => {
    const hero = newHero();
    hero.pack.push(itemOf('kettleHat'));
    expect(equipFromPack(hero, 0, 'feet').ok).toBe(false);
    expect(equipFromPack(hero, 5).ok).toBe(false);
    expect(hero.pack).toEqual([itemOf('kettleHat')]);
  });

  it('wears tools', () => {
    const hero = newHero();
    hero.pack.push(itemOf('whetstone'));
    equipFromPack(hero, 0);
    expect(hero.tool).toBe(itemOf('whetstone'));
  });
});

describe('taking off and dropping', () => {
  it('moves worn gear to the pack, but never the weapon', () => {
    const hero = newHero();
    expect(unequip(hero, 'cape')).toEqual({ ok: true });
    expect(hero.cape).toBeUndefined();
    expect(hero.pack).toEqual([itemOf('travelerCloak')]);
    expect(unequip(hero, 'weapon').ok).toBe(false);
    expect(unequip(hero, 'head').ok).toBe(false);
  });

  it('will not take off into a full pack', () => {
    const hero = filled(BASE_PACK);
    expect(unequip(hero, 'cape').ok).toBe(false);
    expect(hero.cape).toBe(itemOf('travelerCloak'));
  });

  it('drops from the pack and from the body, which frees the slot', () => {
    const hero = filled(2);
    expect(dropFromPack(hero, 0)).toBe(itemOf('clothHood'));
    expect(hero.pack).toHaveLength(1);
    expect(dropWorn(hero, 'cape')).toEqual({ ok: true, item: itemOf('travelerCloak') });
    expect(hero.cape).toBeUndefined();
    expect(dropWorn(hero, 'weapon').ok).toBe(false);
  });
});

describe('chest loot', () => {
  it('wears gear for an empty slot or an upgrade, packs the rest, and leaves the chest shut when the pack is full', () => {
    const hero = newHero();
    expect(collect(hero, { item: itemOf('kettleHat') }).gear).toBe(itemOf('kettleHat'));
    expect(collect(hero, { item: itemOf('greatHelm') }).gear).toBe(itemOf('greatHelm')); // better: worn
    expect(hero.pack).toEqual([itemOf('kettleHat')]); // the old piece is kept
    expect(collect(hero, { item: itemOf('clothHood') }).gear).toBeUndefined(); // worse: packed
    expect(hero.head).toBe(itemOf('greatHelm'));
    expect(hero.pack).toContain(itemOf('clothHood'));
  });

  it('refuses gear it has nowhere to keep', () => {
    const full = filled(BASE_PACK);
    full.head = itemOf('kettleHat');
    expect(collect(full, { item: itemOf('greatHelm') })).toMatchObject({ refused: true });
    expect(collect(full, { item: itemOf('nasalHelm') })).toMatchObject({ refused: true });
    expect(full.head).toBe(itemOf('kettleHat'));
    expect(full.pack).toHaveLength(BASE_PACK);
    full.head = undefined;
    expect(collect(full, { item: itemOf('nasalHelm') }).gear).toBe(itemOf('nasalHelm')); // empty slot: no room needed
  });
});

const GEAR_NONE = GEAR_SLOTS.map(() => 0);

describe('wearIfBetter', () => {
  it('puts a better piece on and sends the old one to the pack', () => {
    const hero = newHero();
    expect(wearIfBetter(hero, itemOf('bronzeSword'))).toBe(true);
    expect(hero.weapon).toBe(itemOf('bronzeSword'));
    expect(hero.pack).toEqual([itemOf('rustySword')]);
  });

  it('fills an empty slot without touching the pack, and leaves a worse piece alone', () => {
    const hero = newHero();
    expect(wearIfBetter(hero, itemOf('clothHood'))).toBe(true);
    expect(hero.head).toBe(itemOf('clothHood'));
    expect(hero.pack).toEqual([]);
    expect(wearIfBetter(hero, itemOf('clothHood'))).toBe(false);
    expect(wearIfBetter(hero, itemOf('potion'))).toBe(false);
  });
});

describe('wearFromPack', () => {
  it('wears a piece from the pack, swapping with what is worn', () => {
    const hero = newHero();
    hero.weapon = itemOf('bronzeSword');
    hero.pack.push(itemOf('rustySword'));
    expect(wearFromPack(hero, itemOf('rustySword'))).toEqual({ ok: true });
    expect(hero.weapon).toBe(itemOf('rustySword'));
    expect(hero.pack).toEqual([itemOf('bronzeSword')]);
    expect(wearFromPack(hero, itemOf('steelSword')).ok).toBe(false); // not in the pack
    hero.pack.push(itemOf('potion'));
    expect(wearFromPack(hero, itemOf('potion')).ok).toBe(false); // not wearable
  });
});

describe('isBetter and upgrade', () => {
  it('compares against the worn piece in the same slot', () => {
    const hero = newHero();
    expect(isBetter(hero, itemOf('steelSword'))).toBe(true);
    expect(isBetter(hero, itemOf('rustySword'))).toBe(false);
    expect(upgrade(hero, itemOf('steelSword'))).toBe(3);
    expect(upgrade(hero, itemOf('clothHood'))).toBe(1); // an empty slot is worth nothing
    expect(upgrade(hero, itemOf('potion'))).toBe(0);
  });
});

describe('packEntries', () => {
  it('groups the same item and keeps first-seen order', () => {
    const hero = newHero();
    hero.pack.push(itemOf('potion'), itemOf('bronzeSword'), itemOf('potion'));
    expect(packEntries(hero)).toEqual([
      { item: itemOf('potion'), count: 2 },
      { item: itemOf('bronzeSword'), count: 1 },
    ]);
  });
});

describe('useFromPack', () => {
  it('drinks a supply and uses it up', () => {
    const hero = newHero();
    hero.pack.push(itemOf('potion'), itemOf('potion'));
    hero.stats.hp = 5;
    expect(useFromPack(hero, itemOf('potion'))?.text).toBe('+20 HP');
    expect(hero.stats.hp).toBe(25);
    expect(hero.pack).toEqual([itemOf('potion')]);
  });

  it('does not waste a supply on someone who needs nothing', () => {
    const hero = newHero();
    hero.pack.push(itemOf('potion'));
    expect(useFromPack(hero, itemOf('potion'))).toBeNull();
    expect(hero.pack).toHaveLength(1);
  });

  it('restores MP too with an elixir, even at full HP', () => {
    const hero = newHero();
    hero.pack.push(itemOf('elixir'));
    hero.stats.mp = 0;
    expect(useFromPack(hero, itemOf('elixir'))).not.toBeNull();
    expect(hero.stats.mp).toBe(hero.stats.maxMp);
  });

  it('refuses gear and things not in the pack', () => {
    const hero = newHero();
    hero.pack.push(itemOf('bronzeSword'));
    hero.stats.hp = 1;
    expect(useFromPack(hero, itemOf('bronzeSword'))).toBeNull();
    expect(useFromPack(hero, itemOf('elixir'))).toBeNull();
  });
});

describe('item codes', () => {
  it('give every item its own code, and 0 means nothing', () => {
    const codes = Object.values(ITEMS).map(itemCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Math.min(...codes)).toBe(1);
    expect(Math.max(...codes)).toBe(itemCount());
    for (const item of Object.values(ITEMS)) expect(itemFromCode(itemCode(item))).toBe(item);
    expect(itemFromCode(0)).toBeUndefined();
    expect(itemFromCode(itemCount() + 1)).toBeUndefined();
  });

  it("carry a hero's gear and pack to a copy of them", () => {
    const hero = newHero();
    wearIfBetter(hero, itemOf('steelSword'));
    wearIfBetter(hero, itemOf('greatHelm'));
    hero.bag = itemOf('sack');
    hero.pack.push(itemOf('potion'), itemOf('potion'));
    const copy = newHero();
    copy.cape = undefined; // the copy starts with something else on
    setGear(copy, gearCodes(hero));
    setPack(copy, packCodes(hero));
    expect(copy).toMatchObject({
      weapon: itemOf('steelSword'),
      head: itemOf('greatHelm'),
      cape: itemOf('travelerCloak'),
      bag: itemOf('sack'),
    });
    expect(copy.pack).toEqual(hero.pack);
  });

  it('take pieces off that the host says are gone, but never leave the hero unarmed', () => {
    const hero = newHero();
    wearIfBetter(hero, itemOf('clothHood'));
    setGear(hero, GEAR_NONE);
    expect(hero.head).toBeUndefined();
    expect(hero.cape).toBeUndefined();
    expect(hero.weapon).toBe(itemOf('rustySword'));
  });
});

describe('Inventory actions as data', () => {
  const ops: InvOp[] = [
    { t: 'equip', index: 3 },
    { t: 'equip', index: 0, slot: 'offhand' },
    { t: 'unequip', slot: 'cape' },
    { t: 'use', index: 2 },
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
      [4, -1, 0],
    ] as const) {
      expect(decodeOp([...wire]), wire.join()).toBeNull();
    }
  });

  it('does the action and hands back what was dropped', () => {
    const hero = newHero();
    hero.pack.push(itemOf('kettleHat'));
    expect(applyInvOp(hero, { t: 'dropPack', index: 0 })).toEqual({ ok: true, dropped: itemOf('kettleHat') });
    expect(hero.pack).toEqual([]);
    expect(applyInvOp(hero, { t: 'dropWorn', slot: 'cape' })).toEqual({ ok: true, dropped: itemOf('travelerCloak') });
    expect(hero.cape).toBeUndefined();
  });

  it('drinks a supply, and refuses when it would do nothing', () => {
    const hero = newHero();
    hero.pack.push(itemOf('potion'));
    expect(applyInvOp(hero, { t: 'use', index: 0 }).ok).toBe(false); // already at full health
    expect(hero.pack).toHaveLength(1);
    hero.stats.hp = 5;
    expect(applyInvOp(hero, { t: 'use', index: 0 }).ok).toBe(true);
    expect(hero.pack).toHaveLength(0);
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

describe('items on the ground', () => {
  it('last three minutes, and blink for the last stretch', () => {
    expect(GROUND_LIFETIME).toBe(180);
    expect(groundRemaining(0)).toBe(180);
    expect(groundRemaining(100)).toBe(80);
    expect(groundRemaining(500)).toBe(0);
    expect(groundFading(GROUND_LIFETIME - 100)).toBe(false);
    expect(groundFading(GROUND_WARNING - 1)).toBe(true);
    expect(groundFading(0)).toBe(true);
  });
});
