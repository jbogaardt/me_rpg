import { describe, expect, it } from 'vitest';
import { newHero, type Hero } from './combat';
import { guideFor, searchMiddle, SEARCH_RADIUS, trackerText, type GuideWorld } from './guide';
import { QUESTS, offererOf, talk } from './quests';
import { ZONE_NAMES } from './places';

const world = (zone: string, extra: Partial<GuideWorld> = {}): GuideWorld => ({
  zone,
  doors: [],
  sites: [],
  mobs: [],
  givers: [],
  places: [],
  ...extra,
});
const door = (to: string, col = 10, row = 5) => ({ col, row, w: 2, to: { zone: to } });
const origin = { x: 0, y: 0 };

/** A hero who has been given the quest `id` (every one before it handed in). */
function onQuest(id: string): Hero {
  const hero = newHero();
  const q = QUESTS.find((x) => x.id === id)!;
  hero.quests = { stage: QUESTS.indexOf(q), taken: false, progress: 0 };
  talk(hero, offererOf(q));
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
  it('leads to the person who gives or takes the task', () => {
    const hero = newHero(); // Maren gives the first quest
    const here = world('town', {
      givers: [
        { id: 'hale', x: 10, y: 10 },
        { id: 'maren', x: 100, y: 50 },
      ],
    });
    expect(guideFor(hero, here, origin)).toEqual({ x: 100, y: 50, label: 'Maren' });
    talk(hero, 'maren'); // sent to Captain Hale: he takes it
    expect(guideFor(hero, here, origin)).toEqual({ x: 10, y: 10, label: 'Hale' });
    // From the Greenwood it leads to the door towards Lanternrest.
    const g = guideFor(hero, world('greenwood', { doors: [door('desert'), door('town', 20, 30)] }), origin);
    expect(g?.label).toBe('Lanternrest');
    expect(g?.y).toBe(30.5 * 32);
  });

  it('leads to the nearest thing the task wants in the right zone', () => {
    const lurker = onQuest('dead'); // four skeletons, in the Barrow Lands
    const w = world('undead', {
      mobs: [
        { key: 'zombie', x: 10, y: 0 },
        { key: 'skeleton', x: 500, y: 0 },
        { key: 'skeleton', x: 200, y: 0 },
      ],
    });
    const g = guideFor(lurker, w, origin)!;
    expect(g.radius).toBe(SEARCH_RADIUS); // an area to search, not a spot
    expect(Math.hypot(g.x - 200, g.y - 0)).toBeLessThan(SEARCH_RADIUS); // ...that does hold the skeleton
    expect(g.x === 200 && g.y === 0).toBe(false); // ...but is not centred on it
    expect(guideFor(lurker, world('undead'), origin)).toBeNull(); // none about right now

    const caps = onQuest('lamp');
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

  it('marks a named place as an area to search, not a spot', () => {
    const ledge = onQuest('ledge');
    const places = [{ name: 'The Frozen Ledge', x: 4000, y: 3000 }];
    const g = guideFor(ledge, world('frostlands', { places }), origin)!;
    expect(g.radius).toBe(SEARCH_RADIUS);
    expect(Math.hypot(g.x - 4000, g.y - 3000)).toBeLessThan(SEARCH_RADIUS);
  });

  it('leads to the door towards a far zone, through the zones in between', () => {
    const sand = onQuest('sand');
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
    const medicine = onQuest('elixir');
    const w = world('town', { doors: [door('shop_smithy', 1, 1), door('shop_apothecary', 20, 9)] });
    expect(guideFor(medicine, w, origin)).toMatchObject({ y: 9.5 * 32, label: "The Apothecary's Shop" });
  });

  it('is silent when every task is done', () => {
    const hero = newHero();
    hero.quests.stage = QUESTS.length;
    expect(guideFor(hero, world('town', { givers: [{ id: 'maren', x: 1, y: 1 }] }), origin)).toBeNull();
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
    const g = guideFor(newHero(), world('town', { givers: [{ id: 'maren', x: 100, y: 50 }] }), origin)!;
    expect(g.radius).toBeUndefined();
  });
});

describe('the tracker line', () => {
  it('says what to do next, and who to see', () => {
    const hero = newHero();
    expect(trackerText(hero)).toBe('Speak to Maren in Lanternrest');
    talk(hero, 'maren');
    expect(trackerText(hero)).toBe("The Captain's Wound: speak to Hale in Lanternrest");
    talk(hero, 'hale');
    expect(trackerText(hero)).toBe('Speak to Hale in Lanternrest'); // Hale gives the next one
    talk(hero, 'hale');
    expect(trackerText(hero)).toBe('Warmth for the Watch: 0/1 elixir');
  });
});
