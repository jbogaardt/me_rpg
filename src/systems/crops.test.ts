import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import {
  advance,
  CROP_IDS,
  CROPS,
  cropFrame,
  decodePlot,
  FARM_YIELD,
  growth,
  harvest,
  isRipe,
  isWet,
  needsWater,
  newPlot,
  plant,
  PLOT_CODES,
  plotCode,
  plotStage,
  rain,
  RAIN_WET,
  RIPE,
  seedInPack,
  STAGES,
  water,
  WATERINGS,
  wetTime,
  WILD_YIELD,
} from './crops';
import { BASE_PACK } from './inventory';
import { ITEMS } from './items';
import { CAN_CAPACITY } from './water';
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

/** A hero with a watering can that is full. */
function gardener() {
  const hero = newHero();
  hero.pack.push(ITEMS.wateringCan);
  hero.stats.can = CAN_CAPACITY;
  return hero;
}

/** A carrot planted (dry) at clock 0. */
function carrot() {
  const p = newPlot(null, 0);
  p.crop = 'carrot';
  p.wild = false;
  return p;
}

describe('a plot', () => {
  it('does not grow while it is dry', () => {
    const p = carrot();
    advance(p, 10_000);
    expect(p.grown).toBe(0);
    expect(plotStage(p)).toBe(0);
    expect(needsWater(p, 10_000)).toBe(true);
  });

  it('grows only for the time it is wet, through the stages, until ripe', () => {
    const p = carrot();
    const grow = CROPS.carrot.grow;
    p.wetUntil = 20;
    advance(p, 10);
    expect(p.grown).toBe(10);
    advance(p, 400); // dry again from 20: only the wet 10 more count
    expect(p.grown).toBe(20);
    expect(isWet(p, 400)).toBe(false);
    const stages = [0.1, 0.4, 0.7, 0.99].map((f) => {
      p.grown = grow * f;
      return plotStage(p);
    });
    expect(stages).toEqual([0, 1, 2, 2]);
    p.grown = grow;
    expect(isRipe(p)).toBe(true);
    expect(plotStage(p)).toBe(RIPE);
    expect(needsWater(p, 0)).toBe(false); // a ripe plant needs nothing
    p.grown = grow * 10;
    advance(p, 500);
    expect(growth(p)).toBe(1);
  });

  it('is bare soil with no crop, and needs no water', () => {
    const p = newPlot(null, 0);
    expect(plotStage(p)).toBe(-1);
    expect(plotCode(p, 50)).toBe(0);
    expect(needsWater(p, 50)).toBe(false);
  });

  it('is watered from the can: three waterings, each a third of the growing time, ripen it', () => {
    const p = carrot();
    const hero = gardener();
    const seg = wetTime('carrot');
    expect(seg * WATERINGS).toBeCloseTo(CROPS.carrot.grow);
    let clock = 5;
    for (let n = 1; n <= WATERINGS; n++) {
      expect(needsWater(p, clock)).toBe(true);
      expect(water(hero, p, clock)).toEqual({ ok: true, text: `Watered ${n}/${WATERINGS}` });
      expect(needsWater(p, clock + 1)).toBe(false);
      expect(isRipe(p)).toBe(false);
      clock += seg + 10; // it grew for `seg`, then stood dry for 10 s
      advance(p, clock);
      expect(p.grown).toBeCloseTo(seg * n);
    }
    expect(isRipe(p)).toBe(true);
    expect(hero.stats.can).toBe(CAN_CAPACITY - WATERINGS);
    expect(needsWater(p, clock)).toBe(false); // ripe: done
  });

  it('refuses to water a wet plant, with no can or with an empty one, or when there is nothing to water', () => {
    const p = carrot();
    const hero = newHero();
    expect(water(hero, p, 0)).toEqual({ ok: false, text: 'Needs a watering can' });
    hero.pack.push(ITEMS.wateringCan);
    expect(water(hero, p, 0)).toEqual({ ok: false, text: 'The can is empty' });
    hero.stats.can = 3;
    expect(water(hero, p, 10).ok).toBe(true);
    expect(water(hero, p, 11)).toEqual({ ok: false, text: 'Already watered' }); // still wet: no charge spent
    expect(hero.stats.can).toBe(2);
    expect(isWet(p, 10 + wetTime('carrot') - 1)).toBe(true);
    expect(isWet(p, 10 + wetTime('carrot'))).toBe(false);
    expect(water(hero, newPlot(null, 0), 0)).toEqual({ ok: false, text: '' }); // bare soil
    expect(water(hero, newPlot('radish', 0), 0)).toEqual({ ok: false, text: '' }); // ripe
  });

  it('is watered by rain for a while after it falls', () => {
    const p = carrot();
    rain(p, 100);
    expect(isWet(p, 100 + RAIN_WET - 1)).toBe(true);
    expect(isWet(p, 100 + RAIN_WET)).toBe(false);
    advance(p, 100 + RAIN_WET);
    expect(p.grown).toBeGreaterThan(0);
    expect(p.grown).toBeLessThanOrEqual(100 + RAIN_WET);
  });

  it('starts a wild one ripe, and regrows it only once it is watered', () => {
    const hero = gardener();
    const p = newPlot('radish', 1000);
    expect(isRipe(p)).toBe(true);
    expect(harvest(hero, p, 1000)).toEqual({ ok: true, text: `+${WILD_YIELD} Radish` });
    expect(hero.pack.filter((i) => i === ITEMS.radish)).toHaveLength(WILD_YIELD);
    expect(plotStage(p)).toBe(0); // a sprout again
    expect(harvest(hero, p, 1001)).toEqual({ ok: false, text: '' }); // not ripe
    advance(p, 1000 + CROPS.radish.grow * 2);
    expect(isRipe(p)).toBe(false); // dry: nothing grew
    let clock = 2000;
    for (let n = 0; n < WATERINGS; n++) {
      expect(water(hero, p, clock).ok).toBe(true);
      clock += wetTime('radish');
      advance(p, clock);
    }
    expect(isRipe(p)).toBe(true);
  });

  it('plants the first seed from the pack (dry), and gives a better harvest once grown', () => {
    const hero = gardener();
    const p = newPlot(null, 0);
    expect(plant(hero, p, 0)).toEqual({ ok: false, text: 'Needs seeds' });
    hero.pack.push(ITEMS.carrotSeeds, ITEMS.cornSeeds);
    expect(seedInPack(hero)?.crop).toBe('carrot');
    expect(plant(hero, p, 10)).toEqual({ ok: true, text: 'Planted Carrot' });
    expect(hero.pack).toContain(ITEMS.cornSeeds);
    expect(hero.pack).not.toContain(ITEMS.carrotSeeds); // one seed used
    expect(plant(hero, p, 10).ok).toBe(false); // already growing
    expect(needsWater(p, 10)).toBe(true);
    p.grown = CROPS.carrot.grow;
    expect(harvest(hero, p, 99)).toEqual({ ok: true, text: `+${FARM_YIELD} Carrot` });
    expect(hero.pack.filter((i) => i === ITEMS.carrot)).toHaveLength(FARM_YIELD);
    expect(p.crop).toBeNull(); // a farm plot is bare again
  });

  it('refuses a harvest when the pack is full, and gives only what fits', () => {
    const hero = newHero();
    while (hero.pack.length < BASE_PACK) hero.pack.push(ITEMS.potion);
    const p = newPlot('pumpkin', 0);
    expect(harvest(hero, p, 0)).toEqual({ ok: false, text: 'Pack full' });
    expect(isRipe(p)).toBe(true); // still there to pick later
    hero.pack.pop();
    const farm = carrot();
    farm.crop = 'pumpkin';
    farm.grown = CROPS.pumpkin.grow;
    expect(harvest(hero, farm, 0).text).toBe('+1 Pumpkin'); // room for one of the two
  });
});

describe('plot codes', () => {
  it('round-trip every crop, stage and wetness, and stay below PLOT_CODES', () => {
    for (const crop of CROP_IDS)
      for (let stage = 0; stage < STAGES; stage++)
        for (const wet of [false, true]) {
          const p = newPlot(null, 0);
          p.crop = crop;
          // Growth that lands on `stage` (the last is ripe).
          p.grown = stage === RIPE ? CROPS[crop].grow : (CROPS[crop].grow * (stage + 0.5)) / (STAGES - 1);
          p.wetUntil = wet ? 100 : 0;
          const code = plotCode(p, 50);
          expect(code).toBeGreaterThan(0);
          expect(code).toBeLessThan(PLOT_CODES);
          expect(decodePlot(code)).toEqual({ crop, stage, wet });
        }
    expect(decodePlot(0)).toBeNull();
    expect(decodePlot(PLOT_CODES)).toBeNull();
  });
});
