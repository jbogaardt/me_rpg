import { describe, expect, it } from 'vitest';
import { attackPower, newHero, spellPower } from './combat';
import { equipFromPack, fitsSlot, iconKind, isBetter } from './inventory';
import { ITEMS } from './items';
import { SHOPS } from './shops';
import { arrows, COMBO_KEYS, progress, SPELL_IDS, SPELLS } from './spells';

const casters = Object.values(ITEMS).filter((item) => 'focus' in item);

describe('wands and tomes', () => {
  it('exist, and some of each kind', () => {
    expect(casters.map((c) => c.focus.kind)).toEqual(expect.arrayContaining(['wand', 'tome']));
  });

  it('are weapons', () => {
    for (const item of casters) expect(item.slot, item.name).toBe('weapon');
  });

  it('each have at least three combos', () => {
    for (const item of casters) expect(item.focus.combos.length, item.name).toBeGreaterThanOrEqual(3);
  });

  it('use only the four directions, with five or six taps, and none hidden inside another', () => {
    for (const item of casters) {
      const all = item.focus.combos.map((c) => c.keys);
      for (const keys of all) {
        expect(keys.length, `${item.name} ${keys}`).toBeGreaterThanOrEqual(5);
        expect(keys.length, `${item.name} ${keys}`).toBeLessThanOrEqual(6);
        expect(
          [...keys].every((k) => (COMBO_KEYS as readonly string[]).includes(k)),
          `${item.name} ${keys}`,
        ).toBe(true);
        // Never the same direction twice in a row: on the on-screen pad that means going back through the middle, and
        // the combo reader ignores a repeated tap anyway.
        expect(/(.)\1/.test(keys), `${item.name} ${keys}`).toBe(false);
        expect(new Set(keys).size, `${item.name} ${keys}`).toBeGreaterThan(1);
      }
      expect(new Set(all).size, item.name).toBe(all.length);
      for (const a of all)
        for (const b of all) if (a !== b) expect(b.includes(a), `${item.name}: ${a} in ${b}`).toBe(false);
    }
  });

  it('are unique: no spell is on two weapons, and no two weapons share a combo', () => {
    const spells = casters.flatMap((i) => i.focus.combos.map((c) => c.spell));
    expect(new Set(spells).size, 'every spell is on one weapon only').toBe(spells.length);
    const keys = casters.flatMap((i) => i.focus.combos.map((c) => c.keys));
    expect(new Set(keys).size, 'every string is on one weapon only').toBe(keys.length);
  });

  it('give a second-tier weapon longer combos than the first-tier one of its kind, and more of them', () => {
    const [apprentice, stormcaller, novice, grimoire] = [
      ITEMS.apprenticeWand,
      ITEMS.stormcallerWand,
      ITEMS.noviceTome,
      ITEMS.arcaneGrimoire,
    ];
    for (const [low, high] of [
      [apprentice, stormcaller],
      [novice, grimoire],
    ] as const) {
      expect(Math.min(...high.focus.combos.map((c) => c.keys.length))).toBeGreaterThan(
        Math.max(...low.focus.combos.map((c) => c.keys.length)),
      );
      expect(high.focus.combos.length).toBeGreaterThan(low.focus.combos.length);
    }
  });

  it('keep the mana costs in a sane range: a hero can cast the first weapons’ spells at once and a spell is not free', () => {
    for (const item of [ITEMS.apprenticeWand, ITEMS.noviceTome]) {
      for (const c of item.focus.combos) expect(c.cost, `${item.name} ${c.spell}`).toBeLessThanOrEqual(20);
    }
    for (const item of casters) for (const c of item.focus.combos) expect(c.cost, c.spell).toBeLessThanOrEqual(24);
  });

  it('cost mana, name a known spell, and give every spell a description', () => {
    for (const item of casters) {
      for (const c of item.focus.combos) {
        expect(c.cost, item.name).toBeGreaterThan(0);
        expect(SPELL_IDS, item.name).toContain(c.spell);
        expect(c.power, item.name).toBeGreaterThan(0);
      }
    }
    for (const id of SPELL_IDS) expect(SPELLS[id].name && SPELLS[id].about).toBeTruthy();
  });

  it('can be cast with the mana a hero of the level that buys them has', () => {
    // A hero starts with 20 MP: the first wand and tome must be castable at once.
    for (const item of [ITEMS.apprenticeWand, ITEMS.noviceTome]) {
      for (const c of item.focus.combos)
        expect(c.cost, `${item.name} ${c.keys}`).toBeLessThanOrEqual(newHero().stats.maxMp);
    }
  });

  it('hit harder than the weapon’s plain attack, for the same hero', () => {
    for (const item of casters) {
      const hero = newHero();
      hero.weapon = item;
      for (const c of item.focus.combos) {
        if (['heal', 'ward', 'dash', 'freeze'].includes(c.spell)) continue; // not (only) damage
        const per = spellPower(hero) * c.power;
        expect(per, `${item.name} ${c.spell}`).toBeGreaterThan(attackPower(hero));
      }
    }
  });

  it('are sold by the wizard, who buys them back and nothing else', () => {
    const wizard = SHOPS.wizard!;
    expect(wizard.stock.map((id) => ITEMS[id].name).sort()).toEqual(casters.map((c) => c.name).sort());
    for (const item of casters) expect(wizard.buys(item), item.name).toBe(true);
    expect(wizard.buys(ITEMS.steelSword)).toBe(false);
    // And no blacksmith takes a wand.
    for (const item of casters) expect(SHOPS.smithy!.buys(item), item.name).toBe(false);
  });

  it('do not fit the off-hand, and are never worn over a blade just for their numbers', () => {
    for (const item of casters) expect(fitsSlot(item, 'offhand'), item.name).toBe(false);
    const hero = newHero();
    expect(isBetter(hero, ITEMS.apprenticeWand)).toBe(false); // the rusty sword is attack 2 as well, and a different kind
    hero.weapon = ITEMS.apprenticeWand;
    expect(isBetter(hero, ITEMS.steelSword)).toBe(false);
    expect(isBetter(hero, ITEMS.stormcallerWand)).toBe(true); // a better wand is
  });

  it('are equipped from the pack like any weapon, and the sword goes back in', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.noviceTome);
    expect(equipFromPack(hero, 0)).toEqual({ ok: true });
    expect(hero.weapon).toBe(ITEMS.noviceTome);
    expect(hero.pack).toEqual([ITEMS.rustySword]);
    expect(iconKind(hero.weapon)).toBe('tome');
    expect(iconKind(ITEMS.apprenticeWand)).toBe('wand');
  });
});

describe('combo display helpers', () => {
  it('shows keys as arrows', () => {
    expect(arrows('uulr')).toBe('↑↑←→');
  });

  it('says how much of a combo was just typed', () => {
    expect(progress('', 'uulr')).toBe(0);
    expect(progress('u', 'uulr')).toBe(1);
    expect(progress('xuu', 'uulr')).toBe(2);
    expect(progress('uul', 'uulr')).toBe(3);
    expect(progress('ud', 'uulr')).toBe(0);
  });
});
