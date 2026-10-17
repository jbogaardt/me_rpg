import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import { SOCKET_SLOTS, bonusFor, bonusTexts, canSet, fuse, fusedId, fusions, isArms } from './gems';
import { applyInvOp, decodeOp, encodeOp, fuseInto, itemCode, itemFromCode } from './inventory';
import { FUSED, ITEMS, fusedOf, itemIds, itemOf } from './items';

const emerald: Item = { name: 'Emerald', value: 90, gem: { arms: { regen: 0.3 }, worn: { defense: 1 } } };
const ruby: Item = { name: 'Ruby', value: 110, gem: { arms: { attack: 2 }, worn: { attack: 1 } } };
const sword: Item = { name: 'Steel Sword', value: 150, slot: 'weapon', attack: 5 };
const helm: Item = { name: 'Nasal Helm', value: 40, slot: 'head', defense: 1 };

describe('setting a gem in a piece', () => {
  it('derives a named, stronger, dearer piece from any base: the base plus the gem, on a weapon or on armour', () => {
    const a = fuse(sword, 'steel', emerald, 'emerald');
    expect(a).toMatchObject({ name: 'Emerald-encrusted Steel Sword', attack: 5, regen: 0.3, value: 240 });
    expect(a.fused).toEqual({ base: 'steel', gem: 'emerald' });
    const b = fuse(helm, 'nasal', emerald, 'emerald');
    expect(b).toMatchObject({ name: 'Emerald-encrusted Nasal Helm', defense: 2, value: 130 });
    expect(b.regen).toBeUndefined();
    expect(fuse(helm, 'nasal', ruby, 'ruby').attack).toBe(1); // armour takes the gem's `worn` side
    expect(fuse(sword, 'steel', ruby, 'ruby').attack).toBe(7);
  });

  it('keeps what the base is: a bow shoots, the look is the same, the base is untouched', () => {
    const bow: Item = {
      name: 'Bow',
      value: 30,
      slot: 'weapon',
      attack: 3,
      ranged: { speed: 1, range: 2, cooldown: 1 },
      look: { weapon: 'w.bow' },
    };
    const made = fuse(bow, 'bow', ruby, 'ruby');
    expect(made.ranged).toBe(bow.ranged);
    expect(made.look).toBe(bow.look);
    expect(bow.attack).toBe(3);
  });

  it('fits only gear: not supplies, bags, tools, gems, or a piece already set', () => {
    const bag: Item = { name: 'Sack', slot: 'bag', capacity: 4 };
    const tool: Item = { name: 'Rod', slot: 'tool' };
    const bread: Item = { name: 'Bread', use: { hp: 0, food: 5 } };
    for (const no of [bag, tool, bread, ruby, emerald]) expect(canSet(emerald, no)).toBe(false);
    expect(canSet(sword, helm)).toBe(false); // a sword is not a gem
    const made = fuse(sword, 'steel', emerald, 'emerald');
    expect(canSet(ruby, made)).toBe(false);
    expect(() => fuse(bag, 'sack', ruby, 'ruby')).toThrow();
    expect(SOCKET_SLOTS).not.toContain('bag');
  });

  it('gives a blade in the off-hand the arms side and a shield the worn side', () => {
    const dagger: Item = { name: 'Dagger', slot: 'offhand', attack: 2 };
    const shield: Item = { name: 'Shield', slot: 'offhand', defense: 2 };
    expect(isArms(dagger)).toBe(true);
    expect(isArms(shield)).toBe(false);
    expect(bonusFor(ruby, dagger)).toEqual({ attack: 2 });
    expect(bonusFor(ruby, shield)).toEqual({ attack: 1 });
  });

  it('makes every pair ahead of time, in a fixed order, under stable ids', () => {
    const items = { sword, helm, emerald, ruby };
    const out = fusions(items);
    expect(Object.keys(out)).toEqual(['sword+emerald', 'sword+ruby', 'helm+emerald', 'helm+ruby']);
    expect(Object.keys(fusions(items))).toEqual(Object.keys(out)); // the same on every page
    expect(fusedId('sword', 'ruby')).toBe('sword+ruby');
    expect(fusions({ sword, helm })).toEqual({});
  });

  it('says what a gem adds in words', () => {
    expect(bonusTexts({ attack: 2, regen: 0.3, xpBonus: 6 })).toEqual(['+2 ATK', '+0.3 HP/s', '+6% XP']);
  });
});

describe('the campaign’s gems and what they make (installed content)', () => {
  it('derive a piece for every gem and every piece of gear that can take one, with codes after the authored items', () => {
    const gems = Object.entries(ITEMS).filter(([, i]) => i.gem);
    expect(gems.length).toBeGreaterThanOrEqual(3);
    const bases = Object.values(ITEMS).filter((i) => i.slot && canSet(gems[0]![1], i));
    expect(Object.keys(FUSED).length).toBe(bases.length * gems.length);
    const authored = Object.keys(ITEMS).length;
    expect(itemIds().length).toBe(authored + Object.keys(FUSED).length);
    for (const [id, made] of Object.entries(FUSED)) {
      expect(itemOf(id)).toBe(made);
      expect(itemCode(made)).toBeGreaterThan(authored);
      expect(itemFromCode(itemCode(made))).toBe(made); // what travels over the network
      const base = ITEMS[made.fused!.base]!;
      expect(made.value!).toBeGreaterThan(base.value!);
      expect(made.name).toContain(ITEMS[made.fused!.gem]!.name);
    }
  });

  it('are better than their base in some number, never worse in any', () => {
    const keys = ['attack', 'defense', 'speed', 'magic', 'regen', 'mpRegen', 'xpBonus', 'goldBonus'] as const;
    for (const made of Object.values(FUSED)) {
      const base = ITEMS[made.fused!.base]!;
      for (const k of keys) expect(made[k] ?? 0).toBeGreaterThanOrEqual(base[k] ?? 0);
      expect(keys.some((k) => (made[k] ?? 0) > (base[k] ?? 0))).toBe(true);
    }
  });
});

describe('the fuse action', () => {
  const heroWith = () => {
    const hero = newHero();
    hero.pack = [itemOf('emerald'), itemOf('steelSword'), itemOf('ruby')];
    return hero;
  };

  it('sets a gem in a carried piece: the gem is used up, the piece changed in place', () => {
    const hero = heroWith();
    const r = fuseInto(hero, 0, { pack: 1 });
    expect(r).toMatchObject({ ok: true });
    expect(hero.pack.map((i) => i.name)).toEqual(['Emerald-encrusted Steel Sword', 'Ruby']);
    expect(hero.pack[0]).toBe(fusedOf(itemOf('steelSword'), itemOf('emerald')));
  });

  it('sets a gem in what is worn, in its slot', () => {
    const hero = heroWith();
    hero.weapon = itemOf('steelSword');
    expect(fuseInto(hero, 2, { slot: 'weapon' }).ok).toBe(true);
    expect(hero.weapon.name).toBe('Ruby-encrusted Steel Sword');
    expect(hero.pack.map((i) => i.name)).toEqual(['Emerald', 'Steel Sword']);
  });

  it('changes nothing when it cannot: not a gem, nothing there, a gem into itself, an empty slot', () => {
    const hero = heroWith();
    const before = JSON.stringify(hero.pack.map((i) => i.name));
    for (const [gem, into] of [
      [1, { pack: 0 }],
      [0, { pack: 7 }],
      [0, { pack: 0 }],
      [0, { pack: 2 }],
      [0, { slot: 'head' }],
      [9, { pack: 1 }],
    ] as const)
      expect(fuseInto(hero, gem, into).ok, `${gem} ${JSON.stringify(into)}`).toBe(false);
    expect(JSON.stringify(hero.pack.map((i) => i.name))).toBe(before);
  });

  it('refuses a piece that is already set with a gem', () => {
    const hero = heroWith();
    fuseInto(hero, 0, { pack: 1 }); // pack: [Emerald-encrusted Steel Sword, Ruby]
    expect(fuseInto(hero, 1, { pack: 0 }).ok).toBe(false);
  });

  it('travels as a numbered Inventory action (a pack index, or a negative worn slot) and back', () => {
    for (const op of [
      { t: 'fuse', gem: 3, into: { pack: 7 } },
      { t: 'fuse', gem: 0, into: { pack: 0 } },
      { t: 'fuse', gem: 2, into: { slot: 'weapon' } },
      { t: 'fuse', gem: 2, into: { slot: 'charm' } },
    ] as const) {
      const wire = encodeOp(op);
      expect(wire[0]).toBe(5);
      expect(decodeOp(wire)).toEqual(op);
    }
    for (const bad of [
      [5, -1, 0],
      [5, 1, 64],
      [5, 1, -11],
      [5, 1.5, 0],
      [5, 1, 0.5],
    ] as const)
      expect(decodeOp([...bad] as [number, number, number])).toBeNull();
  });

  it('is done by the host for a guest exactly as for the player: applyInvOp', () => {
    const hero = heroWith();
    expect(applyInvOp(hero, { t: 'fuse', gem: 0, into: { pack: 1 } })).toMatchObject({ ok: true, made: hero.pack[0] });
  });
});
