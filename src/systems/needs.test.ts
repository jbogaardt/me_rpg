import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { ITEMS } from './items';
import { useFromPack } from './inventory';
import { CELL } from '../map/types';
import {
  drainNeeds,
  drinkableNear,
  drinkFrom,
  needLevel,
  newNeeds,
  NEED_MAX,
  needsRegen,
  PondLevels,
  pondId,
  pondSip,
  POND_MIN_SIP,
  POND_RECOVER,
  POND_SIP,
  refill,
  starveRate,
  thirsty,
} from './needs';

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

  it('cost health only while both meters are empty', () => {
    expect(starveRate({ food: 5, water: 5 }, 100)).toBe(0);
    expect(starveRate({ food: 0, water: 5 }, 100)).toBe(0);
    expect(starveRate({ food: 5, water: 0 }, 100)).toBe(0);
    expect(starveRate({ food: 0, water: 0 }, 100)).toBeCloseTo(3);
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

  describe('drinking from a pond', () => {
    // A 6x4 map: grass with two pond cells at (3,1) and (4,1); a sea cell at (0,3) is not for drinking.
    const surfaces = ['grass', 'water', 'sea'];
    const surface = new Array<number>(24).fill(0);
    surface[1 * 6 + 3] = 1;
    surface[1 * 6 + 4] = 1;
    surface[3 * 6 + 0] = 2;
    const data = { width: 6, height: 4, surfaces, surface };

    it('finds the water beside the bank, not further off', () => {
      // Standing just left of the pond, on the bank cell (2,1).
      expect(drinkableNear(data, 2.6 * CELL, 1.5 * CELL)).toEqual({ x: 3.5 * CELL, y: 1.5 * CELL, cell: 9 });
      // Just below it, nearer the right-hand cell.
      expect(drinkableNear(data, 4.4 * CELL, 2.3 * CELL)).toEqual({ x: 4.5 * CELL, y: 1.5 * CELL, cell: 10 });
      // Two cells away is too far, and the sea does not count.
      expect(drinkableNear(data, 1 * CELL, 1.5 * CELL)).toBeNull();
      expect(drinkableNear(data, 0.5 * CELL, 2.5 * CELL)).toBeNull();
    });

    it('is not on a map without ponds', () => {
      expect(drinkableNear({ width: 1, height: 1, surfaces: ['grass'], surface: [0] }, 16, 16)).toBeNull();
    });

    it('refills water and refuses when not thirsty', () => {
      const n = { food: 50, water: 30 };
      expect(thirsty(n)).toBe(true);
      expect(drinkFrom(n).ok).toBe(true);
      expect(n).toEqual({ food: 50, water: 30 + POND_SIP });
      expect(drinkFrom(n).ok).toBe(true);
      expect(n.water).toBe(NEED_MAX);
      expect(thirsty(n)).toBe(false);
      expect(drinkFrom(n)).toEqual({ ok: false, text: 'Not thirsty' });
    });

    it('gives less each drink from the same pond, down to a trickle', () => {
      const sips = [0, 1, 2, 3].map(pondSip);
      expect(sips[0]).toBe(POND_SIP);
      for (let i = 1; i < sips.length; i++) expect(sips[i]).toBeLessThan(sips[i - 1]!);
      expect(pondSip(50)).toBe(POND_MIN_SIP);
    });

    it('knows one pond from another', () => {
      expect(pondId(data, 1 * 6 + 3)).toBe(pondId(data, 1 * 6 + 4));
      expect(pondId(data, 3 * 6 + 0)).not.toBe(pondId(data, 1 * 6 + 3));
    });

    it('lets a pond recover when left alone, and keeps ponds apart', () => {
      const ponds = new PondLevels();
      expect(ponds.sip(7, 0)).toBe(POND_SIP);
      ponds.record(7, 0);
      ponds.record(7, 1);
      expect(ponds.sip(7, 1)).toBe(pondSip(2));
      expect(ponds.sip(8, 1)).toBe(POND_SIP); // another pond is untouched
      expect(ponds.sip(7, 1 + POND_RECOVER)).toBe(pondSip(1));
      expect(ponds.sip(7, 1 + 2 * POND_RECOVER)).toBe(POND_SIP);
    });
  });
});
