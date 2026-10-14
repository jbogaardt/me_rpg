import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { itemOf } from './items';
import { useFromPack } from './inventory';
import { CELL } from '../map/types';
import {
  drainedLayers,
  drainNeeds,
  drinkableNear,
  needLevel,
  newNeeds,
  NEED_MAX,
  needsRegen,
  pondCapacity,
  pondCells,
  PondLevels,
  pondId,
  pondLayers,
  rainFill,
  RAIN_FILL_TIME,
  refill,
  sipWater,
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
    hero.pack.push(itemOf('bread'));
    const used = useFromPack(hero, itemOf('bread'));
    expect(used?.text).toBe('+30 food');
    expect(hero.needs.food).toBe(60);
    expect(hero.pack).toHaveLength(0);
  });

  it('is refused (and kept) when the meter is already full', () => {
    const hero = newHero();
    hero.pack.push(itemOf('waterskin'));
    expect(useFromPack(hero, itemOf('waterskin'))).toBeNull();
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

    it('fills the meter steadily, never past full', () => {
      const n = { food: 50, water: 30 };
      expect(thirsty(n)).toBe(true);
      expect(sipWater(n, 8, 0.5)).toBe(4);
      expect(n).toEqual({ food: 50, water: 34 });
      expect(sipWater(n, 8, 100)).toBe(NEED_MAX - 34);
      expect(thirsty(n)).toBe(false);
    });

    it('knows one pond from another, and dries it from the shore in', () => {
      expect(pondId(data, 1 * 6 + 3)).toBe(pondId(data, 1 * 6 + 4));
      expect(pondId(data, 3 * 6 + 0)).not.toBe(pondId(data, 1 * 6 + 3));
      // A 5x5 pond: its middle cell is the last to dry.
      const big = { width: 7, height: 7, surfaces: ['grass', 'water'], surface: new Array<number>(49).fill(0) };
      for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) big.surface[r * 7 + c] = 1;
      const cells = pondCells(big, pondId(big, 8));
      expect(cells).toHaveLength(25);
      expect(cells.at(-1)).toBe(3 * 7 + 3);
      expect(pondCapacity(big, pondId(big, 8))).toBeGreaterThan(0);
    });

    it('drains as it is drunk, gives nothing when dry, and only rain fills it', () => {
      const ponds = new PondLevels();
      expect(ponds.drink(7, 30, 60)).toBe(30);
      expect(ponds.level(7)).toBeCloseTo(0.5);
      expect(ponds.level(8)).toBe(0); // another pond is untouched
      expect(ponds.drink(7, 50, 60)).toBe(30); // only what is left
      expect(ponds.drink(7, 5, 60)).toBe(0);
      expect(ponds.level(7)).toBe(1);
      ponds.rain(rainFill(null, 1), 1000); // clear skies fill nothing
      ponds.rain(rainFill('snow', 1), 1000); // nor does snow
      expect(ponds.level(7)).toBe(1);
      ponds.rain(rainFill('rain', 1), RAIN_FILL_TIME / 2);
      expect(ponds.level(7)).toBeCloseTo(0.5);
      expect(ponds.refilling(7)).toBe(true); // it ran dry, so it fills from the middle out
      ponds.rain(rainFill('storm', 1), RAIN_FILL_TIME / 4); // a storm fills twice as fast
      expect(ponds.levels()).toEqual([]);
      expect(ponds.refilling(7)).toBe(false);
      ponds.drink(7, 10, 60); // only part drunk: not refilling
      expect(ponds.levels()).toEqual([[7, 10 / 60, false]]);
    });

    it('is remembered and told as a list of levels', () => {
      const ponds = new PondLevels();
      ponds.drink(3, 10, 40);
      const copy = new PondLevels();
      copy.setLevels(ponds.levels());
      expect(copy.level(3)).toBeCloseTo(0.25);
      copy.setLevels([[3, 0.5, true]]);
      expect(copy.refilling(3)).toBe(true);
      copy.setLevels([]);
      expect(copy.level(3)).toBe(0);
    });
  });
});

describe('the layers of a pond', () => {
  it('go from the shore in, a wide ring taking longer than a small middle', () => {
    const layers = [[1, 2, 3, 4, 5, 6, 7, 8], [9]];
    expect(drainedLayers(layers, 0)).toEqual({ gone: 0, fading: 0 });
    expect(drainedLayers(layers, 4 / 9)).toEqual({ gone: 0, fading: 0.5 });
    expect(drainedLayers(layers, 8 / 9 + 0.5 / 9).gone).toBe(1);
    expect(drainedLayers(layers, 1)).toEqual({ gone: 2, fading: 0 });
  });

  it('are rings of a real pond', () => {
    const big = { width: 7, height: 7, surfaces: ['grass', 'water'], surface: new Array<number>(49).fill(0) };
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) big.surface[r * 7 + c] = 1;
    expect(pondLayers(big, pondId(big, 8)).map((l) => l.length)).toEqual([16, 8, 1]);
  });
});
