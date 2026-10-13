import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import {
  CROP_KINDS,
  CROP_STAGES,
  CROPS,
  cropCode,
  cropFromCode,
  cropStage,
  canHarvest,
  harvest,
  RIPE_CODE,
  waterWith,
} from './crops';
import { BASE_PACK } from './inventory';
import { ITEMS } from './items';

describe('crops', () => {
  it('give every crop an edible produce that feeds', () => {
    for (const kind of CROP_KINDS) {
      const use = (ITEMS[CROPS[kind].item] as Item).use;
      expect(use, kind).toBeDefined();
      expect((use?.food ?? 0) + (use?.water ?? 0), kind).toBeGreaterThan(0);
      expect(CROPS[kind].grow, kind).toBeGreaterThan(0);
    }
  });

  it('draw the phase while growing and the last stage when ripe', () => {
    expect([0, 1, 2].map((phase) => cropStage({ ripe: false, phase }))).toEqual([0, 1, 2]);
    expect(cropStage({ ripe: true, phase: 0 })).toBe(CROP_STAGES - 1);
  });

  it('travel to a guest as a small code and back', () => {
    for (const ripe of [false, true])
      for (const phase of ripe ? [0] : [0, 1, 2])
        for (const dry of ripe ? [false] : [false, true]) {
          const state = { ripe, phase, dry };
          expect(cropFromCode(cropCode(state))).toEqual(state);
        }
    expect(cropCode({ ripe: true, phase: 0, dry: false })).toBe(RIPE_CODE);
    expect(cropFromCode(RIPE_CODE + 1)).toBeNull();
    expect(cropFromCode(-1)).toBeNull();
    expect(cropFromCode(1.5)).toBeNull();
  });

  it('are picked into the pack', () => {
    const hero = newHero();
    const got = harvest(hero, 'carrot');
    expect(got.ok).toBe(true);
    expect(hero.pack).toEqual([ITEMS.carrot, ITEMS.carrot]);
  });

  it('are left alone when the pack has no room for the whole pick', () => {
    const hero = newHero();
    hero.pack = Array.from({ length: BASE_PACK - 1 }, () => ITEMS.potion);
    const got = harvest(hero, 'carrot'); // two carrots, one slot
    expect(got).toMatchObject({ ok: false, text: 'Pack full' });
    expect(hero.pack).toHaveLength(BASE_PACK - 1);
    expect(harvest(hero, 'pumpkin').ok).toBe(true); // a single pumpkin fits
  });

  it('say whether a whole pick fits the pack', () => {
    const hero = newHero();
    expect(canHarvest(hero, 'carrot')).toBe(true);
    hero.pack = Array.from({ length: BASE_PACK - 1 }, () => ITEMS.potion);
    expect(canHarvest(hero, 'carrot')).toBe(false);
    expect(canHarvest(hero, 'pumpkin')).toBe(true);
    expect(canHarvest(hero, 'nope')).toBe(false);
  });

  it('refuse an unknown crop', () => {
    expect(harvest(newHero(), 'nope').ok).toBe(false);
  });

  it('are watered with a waterskin, which is used up', () => {
    const hero = newHero();
    expect(waterWith(hero)).toEqual({ ok: false, text: 'Need a Waterskin' });
    hero.pack.push(ITEMS.waterskin, ITEMS.waterskin);
    expect(waterWith(hero).ok).toBe(true);
    expect(hero.pack).toEqual([ITEMS.waterskin]);
  });
});
