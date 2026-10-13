import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import { CROP_KINDS, CROP_STAGES, CROPS, cropStage, harvest } from './crops';
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

  it('grow through the stages and ripen only at the end', () => {
    expect(cropStage(0, 100)).toBe(0);
    expect(cropStage(40, 100)).toBe(1);
    expect(cropStage(70, 100)).toBe(2);
    expect(cropStage(99.9, 100)).toBe(CROP_STAGES - 2);
    expect(cropStage(100, 100)).toBe(CROP_STAGES - 1);
    expect(cropStage(-5, 100)).toBe(0);
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

  it('refuse an unknown crop', () => {
    expect(harvest(newHero(), 'nope').ok).toBe(false);
  });
});
