import { describe, expect, it } from 'vitest';
import { newHero, type Hero } from './combat';
import { guideFor, searchMiddle, SEARCH_RADIUS, trackerText, type GuideWorld } from './guide';
import { QUESTS, talk } from './quests';
import { ZONE_NAMES } from './places';

const world = (zone: string, extra: Partial<GuideWorld> = {}): GuideWorld => ({
  zone,
  doors: [],
  sites: [],
  mobs: [],
  giver: null,
  ...extra,
});
const door = (to: string, col = 10, row = 5) => ({ col, row, w: 2, to: { zone: to } });
const origin = { x: 0, y: 0 };

function onQuest(stage: number): Hero {
  const hero = newHero();
  hero.quests = { stage, taken: false, progress: 0 };
  talk(hero);
  return hero;
}

describe('quest text names the same areas as the game', () => {
  it('writes the area name of every zone a quest sends you to into its hint', () => {
    for (const q of QUESTS) {
      for (const zone of q.where.zones) {
        expect(q.hint.toLowerCase(), q.id).toContain(ZONE_NAMES[zone]!.replace(/^The /, '').toLowerCase());
      }
    }
  });

  it('does not call an area by an old name', () => {
    const text = JSON.stringify(QUESTS).toLowerCase();
    for (const old of ['undead lands', 'western desert', 'the jungle', 'the marsh', ' the desert']) {
      expect(text, old).not.toContain(old);
    }
  });
});

describe('the quest arrow', () => {
  it('leads to the warden for a new task, and to hand one in', () => {
    const hero = newHero();
    expect(guideFor(hero, world('town', { giver: { x: 100, y: 50 } }), origin)).toEqual({
      x: 100,
      y: 50,
      label: 'Maren',
    });
    // From the Greenwood it leads to the door towards Lanternrest.
    const g = guideFor(hero, world('greenwood', { doors: [door('desert'), door('town', 20, 30)] }), origin);
    expect(g?.label).toBe('Lanternrest');
    expect(g?.y).toBe(30.5 * 32);
  });

  it('leads to the nearest thing the task wants in the right zone', () => {
    const goblins = onQuest(0);
    const w = world('greenwood', {
      mobs: [
        { key: 'wolfkin', x: 10, y: 0 },
        { key: 'goblin', x: 500, y: 0 },
        { key: 'goblin', x: 200, y: 0 },
      ],
    });
    const g = guideFor(goblins, w, origin)!;
    expect(g.radius).toBe(SEARCH_RADIUS); // an area to search, not a spot
    expect(Math.hypot(g.x - 200, g.y - 0)).toBeLessThan(SEARCH_RADIUS); // ...that does hold the goblin
    expect(g.x === 200 && g.y === 0).toBe(false); // ...but is not centred on it
    expect(guideFor(goblins, world('greenwood'), origin)).toBeNull(); // none about right now

    const caps = onQuest(1);
    caps.quests.progress = 0b1; // the first is picked
    const sites = [
      { kind: 'glimmercap', index: 0, x: 5, y: 5 },
      { kind: 'glimmercap', index: 1, x: 90, y: 5 },
      { kind: 'glimmercap', index: 2, x: 60, y: 5 },
    ];
    const found = guideFor(caps, world('greenwood', { sites }), origin)!;
    expect(Math.hypot(found.x - 60, found.y - 5)).toBeLessThan(SEARCH_RADIUS);
    expect(found.radius).toBe(SEARCH_RADIUS);
  });

  it('leads to the door towards a far zone, through the zones in between', () => {
    const sand = onQuest(6);
    const here = world('town', {
      doors: [door('greenwood', 4, 4), door('frostlands', 40, 4), door('shop_smithy', 8, 8)],
    });
    expect(guideFor(sand, here, origin)?.label).toBe('The Greenwood');
    expect(guideFor(sand, world('greenwood', { doors: [door('town'), door('desert', 2, 2)] }), origin)?.label).toBe(
      'The Sunscar Desert',
    );
    const inShop = world('shop_smithy', { doors: [door('town')] });
    expect(guideFor(sand, inShop, origin)?.label).toBe('Lanternrest');
  });

  it('leads to the apothecary door for a bring task', () => {
    const medicine = onQuest(3);
    const w = world('town', { doors: [door('shop_smithy', 1, 1), door('shop_apothecary', 20, 9)] });
    expect(guideFor(medicine, w, origin)).toMatchObject({ y: 9.5 * 32, label: "The Apothecary's Shop" });
  });

  it('is silent when every task is done', () => {
    const hero = newHero();
    hero.quests.stage = QUESTS.length;
    expect(guideFor(hero, world('town', { giver: { x: 1, y: 1 } }), origin)).toBeNull();
    expect(trackerText(hero)).toBe('');
  });
});

describe('the search area', () => {
  it('holds still while the target stays in its square, and always contains it', () => {
    expect(searchMiddle(100, 100)).toEqual(searchMiddle(140, 120));
    for (let i = 0; i < 400; i++) {
      const [x, y] = [(i * 977) % 6000, (i * 613) % 4000];
      const m = searchMiddle(x, y);
      expect(Math.hypot(m.x - x, m.y - y), `${x},${y}`).toBeLessThan(SEARCH_RADIUS);
    }
  });

  it('is not given for a person or a door, which are known places', () => {
    const g = guideFor(newHero(), world('town', { giver: { x: 100, y: 50 } }), origin)!;
    expect(g.radius).toBeUndefined();
  });
});

describe('the tracker line', () => {
  it('says what to do next', () => {
    const hero = newHero();
    expect(trackerText(hero)).toBe('Speak to Maren in Lanternrest');
    talk(hero);
    expect(trackerText(hero)).toBe('Trouble on the Road: 0/5 goblins');
    hero.quests.progress = 5;
    expect(trackerText(hero)).toBe('Trouble on the Road: return to Maren');
  });
});
