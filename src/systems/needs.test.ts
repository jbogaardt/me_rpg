import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { ITEMS } from './items';
import { useFromPack } from './inventory';
import { drainNeeds, needLevel, newNeeds, NEED_MAX, needsRegen, refill } from './needs';

describe('needs', () => {
  it('start full and drain over time, never below zero', () => {
    const n = newNeeds();
    drainNeeds(n, 60);
    expect(n.food).toBeLessThan(NEED_MAX);
    expect(n.water).toBeLessThan(n.food); // thirst comes first
    drainNeeds(n, 1e6);
    expect(n).toEqual({ food: 0, water: 0 });
  });

  it('read as levels', () => {
    expect([100, 60, 59, 20, 19, 1, 0].map(needLevel)).toEqual(['full', 'full', 'ok', 'ok', 'low', 'low', 'empty']);
  });

  it('change mending by the worse meter', () => {
    expect(needsRegen({ food: 100, water: 100 })).toBe(1.25);
    expect(needsRegen({ food: 100, water: 40 })).toBe(1);
    expect(needsRegen({ food: 10, water: 100 })).toBe(0.5);
    expect(needsRegen({ food: 100, water: 0 })).toBe(0);
  });

  it('refill up to full and report when nothing changes', () => {
    const n = { food: 80, water: 10 };
    expect(refill(n, 50, 30)).toBe(true);
    expect(n).toEqual({ food: 100, water: 40 });
    expect(refill({ food: 100, water: 100 }, 20, 20)).toBe(false);
  });
});

describe('eating and drinking', () => {
  it('uses up a ration and fills the meter', () => {
    const hero = newHero();
    hero.needs = { food: 30, water: 100 };
    hero.pack.push(ITEMS.bread);
    const used = useFromPack(hero, ITEMS.bread);
    expect(used?.text).toBe('+30 food');
    expect(hero.needs.food).toBe(60);
    expect(hero.pack).toHaveLength(0);
  });

  it('is refused (and kept) when the meter is already full', () => {
    const hero = newHero();
    hero.pack.push(ITEMS.waterskin);
    expect(useFromPack(hero, ITEMS.waterskin)).toBeNull();
    expect(hero.pack).toHaveLength(1);
  });
});
