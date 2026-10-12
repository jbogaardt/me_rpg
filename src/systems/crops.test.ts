import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import {
  CROP_IDS,
  CROPS,
  cropFrame,
  decodePlot,
  FARM_YIELD,
  growth,
  harvest,
  isRipe,
  newPlot,
  plant,
  PLOT_CODES,
  plotCode,
  plotStage,
  RIPE,
  seedInPack,
  STAGES,
  WILD_YIELD,
} from './crops';
import { BASE_PACK } from './inventory';
import { ITEMS } from './items';
import { SHOPS } from './shops';

const items: Record<string, Item> = ITEMS;

describe('crop data', () => {
  it('names produce that can be eaten and seeds that plant it', () => {
    for (const id of CROP_IDS) {
      const k = CROPS[id];
      const produce = items[k.produce];
      const seed = items[k.seed];
      expect(produce?.crop, id).toBe(id);
      expect(produce?.use?.food, id).toBeGreaterThan(0);
      expect(seed?.seed, id).toBe(id);
      expect(k.grow, id).toBeGreaterThan(0);
    }
  });

  it('cuts every frame (and the picked one) from inside the 1024px sheet', () => {
    for (const id of CROP_IDS)
      for (let stage = 0; stage <= STAGES; stage++) {
        const f = cropFrame(id, stage);
        expect(f.x + f.w, id).toBeLessThanOrEqual(1024);
        expect(f.y + f.h, id).toBeLessThanOrEqual(1024);
      }
  });

  it('is sold as seeds by the apothecary', () => {
    for (const id of CROP_IDS) expect(SHOPS.apothecary?.stock, id).toContain(CROPS[id].seed);
  });
});

describe('a plot', () => {
  it('goes through the stages and is ripe only when fully grown', () => {
    const p = newPlot(null, 0);
    p.crop = 'carrot';
    p.since = 100;
    expect(plotStage(p, 100)).toBe(0);
    const grow = CROPS.carrot.grow;
    const stages = [0.1, 0.4, 0.7, 0.99].map((f) => plotStage(p, 100 + grow * f));
    expect(stages).toEqual([0, 1, 2, 2]);
    expect(isRipe(p, 100 + grow * 0.99)).toBe(false);
    expect(plotStage(p, 100 + grow)).toBe(RIPE);
    expect(growth(p, 100 + grow * 5)).toBe(1);
  });

  it('is bare soil with no crop', () => {
    const p = newPlot(null, 0);
    expect(plotStage(p, 50)).toBe(-1);
    expect(plotCode(p, 50)).toBe(0);
  });

  it('starts a wild one ripe, and regrows it after a pick', () => {
    const hero = newHero();
    const p = newPlot('radish', 1000);
    expect(isRipe(p, 1000)).toBe(true);
    expect(harvest(hero, p, 1000)).toEqual({ ok: true, text: `+${WILD_YIELD} Radish` });
    expect(hero.pack.map((i) => i.name)).toEqual(['Radish']);
    expect(plotStage(p, 1000)).toBe(0); // a sprout again
    expect(harvest(hero, p, 1001)).toEqual({ ok: false, text: '' }); // not ripe
    expect(isRipe(p, 1000 + CROPS.radish.grow)).toBe(true);
  });

  it('plants the first seed from the pack, grows, and gives a better harvest', () => {
    const hero = newHero();
    const p = newPlot(null, 0);
    expect(plant(hero, p, 0)).toEqual({ ok: false, text: 'Needs seeds' });
    hero.pack.push(ITEMS.carrotSeeds, ITEMS.cornSeeds);
    expect(seedInPack(hero)?.crop).toBe('carrot');
    expect(plant(hero, p, 10)).toEqual({ ok: true, text: 'Planted Carrot' });
    expect(hero.pack).toEqual([ITEMS.cornSeeds]); // one seed used
    expect(plant(hero, p, 10).ok).toBe(false); // already growing
    const ripe = 10 + CROPS.carrot.grow;
    expect(harvest(hero, p, ripe)).toEqual({ ok: true, text: `+${FARM_YIELD} Carrot` });
    expect(hero.pack.filter((i) => i === ITEMS.carrot)).toHaveLength(FARM_YIELD);
    expect(p.crop).toBeNull(); // a farm plot is bare again
  });

  it('refuses a harvest when the pack is full, and gives only what fits', () => {
    const hero = newHero();
    while (hero.pack.length < BASE_PACK) hero.pack.push(ITEMS.potion);
    const p = newPlot('pumpkin', 0);
    expect(harvest(hero, p, 0)).toEqual({ ok: false, text: 'Pack full' });
    expect(isRipe(p, 0)).toBe(true); // still there to pick later
    hero.pack.pop();
    const farm = newPlot(null, 0);
    farm.crop = 'pumpkin';
    farm.since = -CROPS.pumpkin.grow;
    expect(harvest(hero, farm, 0).text).toBe('+1 Pumpkin'); // room for one of the two
  });
});

describe('plot codes', () => {
  it('round-trip every crop and stage, and stay below PLOT_CODES', () => {
    for (const crop of CROP_IDS)
      for (let stage = 0; stage < STAGES; stage++) {
        const p = newPlot(null, 0);
        p.crop = crop;
        p.since = 0;
        // Time that lands on `stage`: the middle of its share of the growing time (the last stage is ripe).
        const clock = stage === RIPE ? CROPS[crop].grow : (CROPS[crop].grow * (stage + 0.5)) / (STAGES - 1);
        const code = plotCode(p, clock);
        expect(code).toBeGreaterThan(0);
        expect(code).toBeLessThan(PLOT_CODES);
        expect(decodePlot(code)).toEqual({ crop, stage });
      }
    expect(decodePlot(0)).toBeNull();
    expect(decodePlot(PLOT_CODES)).toBeNull();
  });
});
