import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { HOTBAR_SLOTS, Hotbar, slotOp, viewSlot } from './hotbar';
import { ITEMS } from './items';

const potion = Object.values(ITEMS).find((i) => i.use)!;
const gear = Object.values(ITEMS).find((i) => i.slot === 'weapon')!;

describe('Hotbar', () => {
  it('assigns by name and moves an item that is already on the bar', () => {
    const bar = new Hotbar();
    bar.assign(0, potion);
    bar.assign(2, potion);
    expect(bar.get(0)).toBe('');
    expect(bar.get(2)).toBe(potion.name);
    expect(bar.slotOf(potion)).toBe(2);
    bar.clear(2);
    expect(bar.slotOf(potion)).toBe(-1);
  });

  it('ignores slots out of range and restores only valid saved names', () => {
    const bar = new Hotbar();
    bar.assign(HOTBAR_SLOTS, potion);
    bar.assign(-1, potion);
    expect(bar.toJSON()).toEqual(['', '', '', '']);
    const back = new Hotbar([potion.name, 7, 'x'.repeat(100), gear.name, 'extra']);
    expect(back.toJSON()).toEqual([potion.name, '', '', gear.name]);
    expect(new Hotbar('junk').toJSON()).toEqual(['', '', '', '']);
  });
});

describe('slotOp', () => {
  it('drinks a drinkable, wears gear, and does nothing for an empty or missing slot', () => {
    const hero = newHero();
    hero.pack.push(gear, potion);
    expect(slotOp(hero, potion.name)).toEqual({ t: 'use', index: 1 });
    expect(slotOp(hero, gear.name)).toEqual({ t: 'equip', index: 0 });
    expect(slotOp(hero, '')).toBeNull();
    expect(slotOp(hero, 'Nothing Like This')).toBeNull();
  });

  it('does nothing for gear that is already worn and not carried', () => {
    const hero = newHero();
    expect(slotOp(hero, hero.weapon.name)).toBeNull();
  });
});

describe('viewSlot', () => {
  it('reports worn and carried counts', () => {
    const hero = newHero();
    hero.pack.push(potion, potion);
    expect(viewSlot(hero, potion.name)).toMatchObject({ worn: false, count: 2 });
    expect(viewSlot(hero, hero.weapon.name)).toMatchObject({ worn: true, count: 0 });
    expect(viewSlot(hero, '')).toEqual({ worn: false, count: 0 });
    expect(viewSlot(hero, 'Gone').item).toBeUndefined();
  });
});
