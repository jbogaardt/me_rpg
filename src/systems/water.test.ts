import { describe, expect, it } from 'vitest';
import { CELL, parseMap, type MapData } from '../map/types';
import { newHero } from './combat';
import { MAX_VITAL } from './survival';
import { DRINK, drink, isThirsty, THIRSTY_BELOW, waterNear } from './water';

/** A 5x3 map: grass, with a pond in column 3 (row 1) and a bog beside it in column 4. */
function pondMap(): MapData {
  const surfaces = ['grass', 'water', 'bog'];
  const surface = new Array<number>(15).fill(0);
  surface[1 * 5 + 3] = 1;
  surface[1 * 5 + 4] = 2;
  return parseMap({
    version: 2,
    width: 5,
    height: 3,
    ground: new Array(15).fill(null),
    surfaces,
    surface,
  });
}

describe('drinking', () => {
  it('fills the bar, a little less when nearly full, and refuses a full one', () => {
    const hero = newHero();
    hero.stats.water = 10;
    expect(drink(hero)).toEqual({ ok: true, text: `+${DRINK} water` });
    expect(hero.stats.water).toBe(10 + DRINK);
    hero.stats.water = MAX_VITAL - 4;
    expect(drink(hero)).toEqual({ ok: true, text: '+4 water' });
    expect(hero.stats.water).toBe(MAX_VITAL);
    expect(drink(hero)).toEqual({ ok: false, text: 'Not thirsty' });
  });

  it('is thirsty below the threshold only', () => {
    const hero = newHero();
    expect(isThirsty(hero)).toBe(false);
    hero.stats.water = THIRSTY_BELOW - 1;
    expect(isThirsty(hero)).toBe(true);
  });
});

describe('water near', () => {
  const map = pondMap();
  const feet = (col: number, row: number) => [(col + 0.5) * CELL, (row + 0.5) * CELL] as const;

  it('finds clear water beside the hero, not far off', () => {
    expect(waterNear(map, ...feet(2, 1))).toBe(true); // on the bank
    expect(waterNear(map, ...feet(2, 0))).toBe(true); // diagonally by it
    expect(waterNear(map, ...feet(0, 1))).toBe(false); // three cells away
  });

  it('does not count a bog, and stays inside the map', () => {
    expect(waterNear(map, ...feet(4, 1))).toBe(true); // standing in the bog, the pond is the next cell over
    const bogOnly = pondMap();
    bogOnly.surface[1 * 5 + 3] = 2; // the pond is a bog too
    expect(waterNear(bogOnly, ...feet(4, 1))).toBe(false);
    expect(waterNear(map, -500, -500)).toBe(false); // well off the map
    expect(waterNear(map, 5000, 5000)).toBe(false);
  });
});
