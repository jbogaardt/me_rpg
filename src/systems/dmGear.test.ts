import { describe, expect, it } from 'vitest';
import { newHero, type GearSlot, type Hero, type Item } from './combat';
import { GEAR_KINDS, MEMORY, gain, giftFor, remember, type GiftMemory } from './dmGear';
import { ITEMS } from './items';

const bow: Item['ranged'] = { speed: 300, range: 256, cooldown: 0.45 };
const focus: Item['focus'] = { kind: 'wand', power: 3, cooldown: 0.5, combos: [] };

/** A small armory with a piece for every slot, so the rotation has something to rotate through. */
const armory: Record<string, Item> = {
  sword: { name: 'Sword', value: 100, slot: 'weapon', attack: 5 },
  longbow: { name: 'Longbow', value: 100, slot: 'weapon', attack: 5, ranged: bow },
  wand: { name: 'Wand', value: 100, slot: 'weapon', attack: 4, focus },
  shield: { name: 'Shield', value: 60, slot: 'offhand', defense: 3 },
  helm: { name: 'Helm', value: 60, slot: 'head', defense: 2 },
  mail: { name: 'Mail', value: 80, slot: 'chest', defense: 4 },
  greaves: { name: 'Greaves', value: 60, slot: 'legs', defense: 2 },
  boots: { name: 'Boots', value: 50, slot: 'feet', defense: 2 },
  cloak: { name: 'Cloak', value: 70, slot: 'cape', defense: 1, speed: 6 },
  satchel: { name: 'Satchel', value: 50, slot: 'bag', capacity: 8 },
  charm: { name: 'Charm', value: 90, slot: 'charm', magic: 3, regen: 0.3, mpRegen: 0.3, xpBonus: 5, speed: 4 },
  legend: { name: 'Legend', value: 9000, slot: 'weapon', attack: 40 },
  bread: { name: 'Bread', value: 2, use: { hp: 5 } },
  ruby: { name: 'Ruby', value: 100, gem: { arms: { attack: 2 }, worn: { attack: 1 } } },
  rod: { name: 'Rod', value: 40, slot: 'tool' },
  fancy: { name: 'Fancy', value: 100, slot: 'head', defense: 9, fused: { base: 'helm', gem: 'ruby' } },
};

const bareHero = (weapon: Item = armory.sword!): Hero => {
  const hero = newHero();
  hero.weapon = {
    name: 'Stick',
    value: 1,
    slot: 'weapon',
    attack: 1,
    ...(weapon.ranged ? { ranged: bow } : weapon.focus ? { focus } : {}),
  };
  return hero;
};

describe('the gear the DM gives', () => {
  it('is varied: over a run of rewards every slot comes up, not the sword every time', () => {
    const hero = bareHero();
    const memory: GiftMemory = new WeakMap();
    const given: GearSlot[] = [];
    for (let seed = 0; seed < 9; seed++) {
      const gift = giftFor(hero, armory, 3, memory.get(hero) ?? [], seed);
      if (!gift) break;
      given.push(gift.slot);
      remember(memory, hero, gift.slot);
      // the hero puts it on, as `collect` does
      const item = armory[gift.id]!;
      if (item.slot === 'weapon') hero.weapon = item;
      else hero[item.slot!] = item;
    }
    expect(new Set(given).size).toBeGreaterThanOrEqual(6);
    expect(given.filter((s) => s === 'weapon').length).toBeLessThanOrEqual(2);
    for (let i = 1; i < given.length; i++) expect(given[i]).not.toBe(given[i - 1]); // never the same slot twice running
  });

  it('never repeats the slot just given while another would help, and falls back to it when nothing else would', () => {
    const hero = bareHero();
    const only: Record<string, Item> = { sword: armory.sword!, helm: armory.helm! };
    for (let seed = 0; seed < 6; seed++) expect(giftFor(hero, only, 3, ['weapon'], seed)?.slot).toBe('head');
    expect(giftFor(hero, { sword: armory.sword! }, 3, ['weapon'])?.slot).toBe('weapon');
  });

  it('is always an upgrade over what the hero wears in that slot, and level-appropriate (twice a hero’s earnings at most)', () => {
    const hero = bareHero();
    hero.head = armory.helm;
    for (let seed = 0; seed < 8; seed++)
      for (const level of [1, 3, 8]) {
        const gift = giftFor(hero, armory, level, [], seed);
        if (!gift) continue;
        const item = armory[gift.id]!;
        expect(gain(hero, item)).toBeGreaterThan(0);
        expect(item.value!).toBeLessThanOrEqual(2 * (30 + 25 * level));
        expect(gift.id).not.toBe('legend');
      }
    expect(giftFor(hero, { helm: armory.helm! }, 3)).toBeNull(); // already wears it
  });

  it('never gives a style the hero does not use: a bow user no sword, a mage no bow, a swordsman no wand', () => {
    for (const [weapon, allowed] of [
      [armory.longbow!, 'longbow'],
      [armory.wand!, 'wand'],
      [armory.sword!, 'sword'],
    ] as const)
      for (let seed = 0; seed < 12; seed++) {
        const gift = giftFor(bareHero(weapon), armory, 3, [], seed);
        if (gift && armory[gift.id]!.slot === 'weapon') expect(gift.id).toBe(allowed);
      }
  });

  it('gives a mage a wand or a tome (and magic charms), and a bow user a bow', () => {
    const onlyWeapons = { sword: armory.sword!, longbow: armory.longbow!, wand: armory.wand! };
    expect(giftFor(bareHero(armory.wand), onlyWeapons, 3)?.id).toBe('wand');
    expect(giftFor(bareHero(armory.longbow), onlyWeapons, 3)?.id).toBe('longbow');
  });

  it('offers bags and charms, and leaves out gems, supplies, tools and pieces made from gems', () => {
    const hero = bareHero();
    const reached = new Set<string>();
    const memory: GiftMemory = new WeakMap(); // the hero never puts anything on, so the rotation alone brings each slot round
    for (let seed = 0; seed < 40; seed++) {
      const gift = giftFor(hero, armory, 4, memory.get(hero) ?? [], seed);
      if (!gift) continue;
      reached.add(gift.id);
      remember(memory, hero, gift.slot);
    }
    expect(reached.has('satchel')).toBe(true);
    expect(reached.has('charm')).toBe(true);
    for (const no of ['bread', 'ruby', 'rod', 'fancy', 'legend']) expect(reached.has(no), no).toBe(false);
  });

  it('values a bag by the slots it adds over the one worn', () => {
    const hero = bareHero();
    expect(gain(hero, armory.satchel!)).toBe(2);
    hero.bag = { name: 'Sack', slot: 'bag', capacity: 4 };
    expect(gain(hero, armory.satchel!)).toBe(1);
    hero.bag = armory.satchel;
    expect(gain(hero, armory.satchel!)).toBe(0);
  });

  it('differs from hero to hero: what helps each most, with the same seed', () => {
    const a = bareHero();
    const b = bareHero();
    a.head = armory.helm;
    a.chest = armory.mail;
    a.legs = armory.greaves;
    a.feet = armory.boots;
    a.cape = armory.cloak;
    a.offhand = armory.shield;
    a.bag = armory.satchel;
    a.charm = armory.charm;
    const ga = giftFor(a, armory, 3, [], 0);
    const gb = giftFor(b, armory, 3, [], 0);
    expect(ga?.slot).toBe('weapon'); // everything else is worn
    expect(gb?.slot).not.toBe('weapon');
    expect(ga?.id).not.toBe(gb?.id);
  });

  it('is the same for the same hero, gear and seed (a guest and a host agree, a test can repeat it)', () => {
    const hero = bareHero();
    expect(giftFor(hero, armory, 3, ['head'], 5)).toEqual(giftFor(hero, armory, 3, ['head'], 5));
  });

  it('remembers the last few slots given, newest first', () => {
    const memory: GiftMemory = new WeakMap();
    const hero = bareHero();
    for (const s of ['weapon', 'head', 'feet', 'cape', 'chest'] as const) remember(memory, hero, s);
    expect(memory.get(hero)).toEqual(['chest', 'cape', 'feet']);
    expect(memory.get(hero)).toHaveLength(MEMORY);
  });

  it('is null when nothing would help, and works on the real campaign’s armory', () => {
    expect(giftFor(bareHero(), {}, 3)).toBeNull();
    const hero = newHero();
    const gift = giftFor(hero, ITEMS, 3, [], 0);
    expect(gift && ITEMS[gift.id]).toBeTruthy();
    const slots = new Set<GearSlot>();
    for (let seed = 0; seed < 12; seed++) slots.add(giftFor(hero, ITEMS, 6, [], seed)!.slot);
    expect(slots.size).toBeGreaterThanOrEqual(3);
  });

  it('pays gear for a forge quest', () => {
    expect(GEAR_KINDS).toContain('forge');
    expect(GEAR_KINDS).not.toContain('hunt');
  });
});
