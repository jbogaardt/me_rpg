import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { emptyCount, FOOD_DRAIN, isWeak, MAX_VITAL, STARVE_DAMAGE, tickVitals, WATER_DRAIN } from './survival';
import { useFromPack } from './inventory';

describe('food and water', () => {
  it('start full and drain at their own rates', () => {
    const h = newHero();
    expect(h.stats.food).toBe(MAX_VITAL);
    tickVitals(h, 10);
    expect(h.stats.food).toBeCloseTo(MAX_VITAL - FOOD_DRAIN * 10);
    expect(h.stats.water).toBeCloseTo(MAX_VITAL - WATER_DRAIN * 10);
    expect(h.stats.water).toBeLessThan(h.stats.food);
    expect(h.stats.hp).toBe(h.stats.maxHp);
  });

  it('is weak when either bar is low', () => {
    const h = newHero();
    expect(isWeak(h)).toBe(false);
    h.stats.water = 20;
    expect(isWeak(h)).toBe(true);
  });

  it('hurts for each empty bar, but never kills', () => {
    const h = newHero();
    h.stats.food = 0;
    tickVitals(h, 1);
    expect(h.stats.hp).toBeCloseTo(h.stats.maxHp - STARVE_DAMAGE);
    h.stats.water = 0;
    expect(emptyCount(h)).toBe(2);
    tickVitals(h, 1000);
    expect(h.stats.hp).toBe(1);
    expect(h.stats.food).toBe(0);
  });

  it('is filled by an item with food or water, and not wasted on a full bar', () => {
    const h = newHero();
    const bread = { name: 'Bread', value: 5, use: { food: 30 } };
    h.pack.push(bread);
    expect(useFromPack(h, bread)).toBeNull(); // already full
    expect(h.pack).toContain(bread);
    h.stats.food = 50;
    expect(useFromPack(h, bread)?.text).toBe('+30 food');
    expect(h.stats.food).toBe(80);
    expect(h.pack).not.toContain(bread);
  });
});
