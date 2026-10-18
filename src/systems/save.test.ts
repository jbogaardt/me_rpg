import { describe, expect, it } from 'vitest';
import { newHero } from './combat';
import { idOfItem, ITEMS, itemOf } from './items';
import {
  applyHeroSave,
  clearSave,
  heroToSave,
  loadSave,
  parseSave,
  SAVE_VERSION,
  writeSave,
  type SaveData,
  type Store,
} from './save';

const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const sample = (world = 'campaign1'): SaveData => {
  const hero = newHero();
  hero.gold = 42;
  hero.stats.level = 3;
  hero.quests = { stage: 2, taken: true, progress: 1 };
  hero.pack = [Object.values(ITEMS).find((i) => i.use)!];
  return {
    v: SAVE_VERSION,
    world,
    savedAt: 1,
    hero: heroToSave(hero),
    node: 'start',
    zone: 'town',
    x: 10,
    y: 20,
    opened: { town: [0, 2] },
  };
};

describe('save', () => {
  it('round-trips a hero, sharing the installed item objects', () => {
    const save = sample();
    const back = parseSave(JSON.stringify(save))!;
    const hero = newHero();
    applyHeroSave(hero, back.hero);
    expect(hero.gold).toBe(42);
    expect(hero.stats.level).toBe(3);
    expect(hero.quests).toEqual({ stage: 2, taken: true, progress: 1 });
    expect(hero.pack).toHaveLength(1);
    expect(idOfItem(hero.pack[0]!)).toBe(save.hero.pack[0]);
    expect(hero.weapon).toBe(itemOf(save.hero.gear.weapon!));
    expect(back.opened).toEqual({ town: [0, 2] });
  });

  it('drops items the world no longer has and keeps the weapon', () => {
    const save = sample();
    save.hero.pack.push('no-such-item');
    save.hero.gear.head = 'gone';
    const hero = newHero();
    const weapon = hero.weapon;
    save.hero.gear.weapon = 'gone';
    applyHeroSave(hero, save.hero);
    expect(hero.pack).toHaveLength(1);
    expect(hero.head).toBeUndefined();
    expect(hero.weapon).toBe(weapon);
  });

  it('refuses text that is not a save of this version', () => {
    expect(parseSave('not json')).toBeNull();
    expect(parseSave('{}')).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(), v: SAVE_VERSION + 1 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(), hero: { name: 1 } }))).toBeNull();
  });

  it('keeps one save per world and forgets it on request', () => {
    const store = memory();
    expect(writeSave(sample('campaign1'), store)).toBe(true);
    expect(loadSave('campaign2', store)).toBeNull();
    expect(loadSave('campaign1', store)?.hero.gold).toBe(42);
    clearSave('campaign1', store);
    expect(loadSave('campaign1', store)).toBeNull();
  });

  it('survives storage that is blocked or full', () => {
    expect(writeSave(sample(), null)).toBe(false);
    const full: Store = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    expect(writeSave(sample(), full)).toBe(false);
    expect(loadSave('campaign1', full)).toBeNull();
  });
});

describe('explored map in a save', () => {
  it('is optional: an older save without it loads', () => {
    const back = parseSave(JSON.stringify(sample()));
    expect(back).not.toBeNull();
    expect(back!.explored).toBeUndefined();
  });

  it('is carried, and non-string entries are dropped', () => {
    const text = JSON.stringify({ ...sample(), explored: { town: '2x2:AQM=', bad: 7 } });
    expect(parseSave(text)!.explored).toEqual({ town: '2x2:AQM=' });
    expect(parseSave(JSON.stringify({ ...sample(), explored: 'junk' }))!.explored).toBeUndefined();
  });
});
