import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import {
  HOTBAR_SHOWN,
  HOTBAR_SLOTS,
  Hotbar,
  SWIPE_MIN_PX,
  TAP_MAX_PX,
  quickOp,
  releaseOf,
  slotOp,
  swipeOf,
  viewSlot,
} from './hotbar';
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

describe('the quick item selection', () => {
  const a = { ...potion, name: 'Potion A' };
  const b = { ...potion, name: 'Potion B' };
  const c = { ...potion, name: 'Potion C' };
  const barWith = (...items: (typeof a)[]) => {
    const bar = new Hotbar();
    items.forEach((it, i) => bar.assign(i, it));
    return bar;
  };

  it('shows three of the four stored slots', () => {
    expect(HOTBAR_SLOTS).toBe(4);
    expect(HOTBAR_SHOWN).toBe(3);
    const hero = newHero();
    hero.pack.push(a, b);
    const bar = new Hotbar([a.name, '', '', b.name]);
    expect(bar.toJSON()).toEqual([a.name, '', '', b.name]); // the hidden slot loads and saves
    expect(bar.ring(hero)).toEqual([0]);
    expect(bar.next(hero)).toBe(false); // the hidden slot is never reached
    expect(bar.select(hero, 3)).toBe(false);
  });

  it('cycles with wrap-around both ways', () => {
    const hero = newHero();
    hero.pack.push(a, b, c);
    const bar = barWith(a, b, c);
    expect(bar.selected).toBe(0);
    expect(bar.next(hero)).toBe(true);
    expect(bar.selected).toBe(1);
    bar.next(hero);
    bar.next(hero);
    expect(bar.selected).toBe(0); // wrapped
    bar.prev(hero);
    expect(bar.selected).toBe(2);
  });

  it('skips empty slots and items no longer carried', () => {
    const hero = newHero();
    hero.pack.push(a, c); // b is gone
    const bar = barWith(a, b, c);
    bar.next(hero);
    expect(bar.selected).toBe(2);
    bar.next(hero);
    expect(bar.selected).toBe(0);
    const gappy = new Hotbar([a.name, '', c.name]);
    gappy.prev(hero);
    expect(gappy.selected).toBe(2);
  });

  it('skips gear: only consumables are quick items', () => {
    const hero = newHero();
    hero.pack.push(a, gear);
    const bar = new Hotbar([a.name, gear.name]);
    expect(quickOp(hero, gear.name)).toBeNull();
    expect(bar.next(hero)).toBe(false);
    expect(bar.ring(hero)).toEqual([0]);
  });

  it('keeps the selection when its item leaves the pack, and moves on cleanly', () => {
    const hero = newHero();
    hero.pack.push(a, b);
    const bar = barWith(a, b);
    bar.next(hero);
    expect(bar.selected).toBe(1);
    hero.pack.splice(1, 1); // the last B is drunk
    expect(bar.selected).toBe(1);
    expect(quickOp(hero, bar.get(1))).toBeNull();
    expect(bar.next(hero)).toBe(true);
    expect(bar.selected).toBe(0);
  });

  it('does not move when nothing else is usable, and a number key selects only a usable slot', () => {
    const hero = newHero();
    hero.pack.push(a);
    const bar = barWith(a, b);
    expect(bar.prev(hero)).toBe(false);
    expect(bar.select(hero, 1)).toBe(false);
    expect(bar.select(hero, 0)).toBe(true);
  });
});

describe('quick button gestures', () => {
  it('a short still press is a tap; slow, drifting or swiped presses are not', () => {
    expect(releaseOf(2, 3, 120)).toBe('tap');
    expect(releaseOf(0, 0, 250)).toBe('none');
    expect(releaseOf(16, 0, 100)).toBe('none');
    expect(releaseOf(0, -20, 100)).toBe('none'); // a swipe up does nothing
  });

  it('swipes need more than 24 px sideways, so they never overlap a tap', () => {
    expect(SWIPE_MIN_PX).toBeGreaterThan(TAP_MAX_PX);
    expect(swipeOf(-25, 3)).toBe('prev');
    expect(swipeOf(25, -3)).toBe('next');
    expect(swipeOf(24, 0)).toBeNull();
    expect(swipeOf(10, 0)).toBeNull();
    expect(swipeOf(0, -40)).toBeNull();
    expect(swipeOf(30, 40)).toBeNull(); // mostly vertical
  });
});
