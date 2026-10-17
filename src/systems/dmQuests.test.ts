import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import { allOffers, huntGoal, levelScale, offerFor, offerReward, relicsFor, upgradeFor, type Land } from './dmQuests';

const land = (l: Partial<Land> = {}): Land => ({
  zone: 'fen',
  level: 3,
  mobs: [
    { key: 'goblin', name: 'Goblin', xp: 12, x: 10, y: 20 },
    { key: 'goblin', name: 'Goblin', xp: 12, x: 50, y: 60 },
    { key: 'troll', name: 'Troll', xp: 60, x: 90, y: 90 },
  ],
  sites: [{ kind: 'echostone', name: 'Echostone', count: 4, x: 300, y: 310 }],
  places: [{ name: 'the Old Mill', x: 700, y: 710 }],
  relics: [{ id: 'charm', name: 'the Wayfarer’s Charm' }],
  casters: false,
  barrels: 0,
  spot: () => ({ x: 900, y: 910 }),
  ...l,
});

describe('quests written from a land', () => {
  it('asks for what the land really holds, one hunt per kind of foe, sized by how tough it is', () => {
    const offers = allOffers(land());
    expect(offers.map((o) => o.title)).toEqual([
      'Hunt 3 Goblins',
      'Hunt 3 Trolls',
      'Gather 3 Echostones',
      'Reach the Old Mill',
      'Find the Wayfarer’s Charm',
    ]);
    expect(offers.find((o) => o.kind === 'hunt')).toMatchObject({ what: 'goblin', goal: 3, zone: 'fen', x: 10, y: 20 });
    expect(offers.find((o) => o.kind === 'find')).toMatchObject({ what: 'charm', goal: 1, x: 900, y: 910 });
  });

  it('grows with the party: more of a foe they have outgrown, the best match first, and bigger pay', () => {
    const at = (level: number) => allOffers(land({ level })).filter((o) => o.kind === 'hunt');
    expect(at(1).map((o) => o.what)).toEqual(['goblin', 'troll']);
    expect(at(8)[0]).toMatchObject({ what: 'troll', level: 8 }); // the troll is the match now
    expect(at(8).find((o) => o.what === 'goblin')!.goal).toBeGreaterThan(at(1)[0]!.goal);
    // a foe they have long outgrown is left out where there is a better one
    const tiny = { key: 'rat', name: 'Rat', xp: 2, x: 0, y: 0 };
    expect(allOffers(land({ level: 8, mobs: [tiny, ...land().mobs] })).some((o) => o.what === 'rat')).toBe(false);
    expect(allOffers(land({ level: 8, mobs: [tiny] })).some((o) => o.what === 'rat')).toBe(true);
    expect(levelScale(1)).toBe(1);
    expect(offerReward('hunt', 5, 8).xp).toBeGreaterThan(offerReward('hunt', 5, 1).xp * 5);
    expect(huntGoal(12, 1)).toBe(3);
    expect(huntGoal(1, 20)).toBe(8);
  });

  it('leaves out what the land cannot give', () => {
    const bare = allOffers(
      land({
        mobs: [],
        sites: [{ kind: 'echostone', name: 'Echostone', count: 1, x: 0, y: 0 }],
        places: [],
        spot: () => null,
      }),
    );
    expect(bare).toEqual([]);
  });

  it('chooses relics worth about what a hero of that level would have earned', () => {
    const items = {
      stick: { name: 'Stick', value: 5, slot: 'weapon' },
      potion: { name: 'Potion', value: 60, use: { hp: 10 } },
      blade: { name: 'Blade', value: 105, slot: 'weapon' },
      crown: { name: 'Crown', value: 900, slot: 'head' },
    };
    expect(relicsFor(items, 3).map((r) => r.id)).toEqual(['blade', 'stick', 'crown']);
    expect(relicsFor(items, 30)[0]!.id).toBe('crown');
  });
});

describe('the offer for a task a saga names outright', () => {
  it('leads to the foe, the sites or the place the land holds, and still offers what it does not hold', () => {
    const here = land();
    const foe = offerFor(here, { t: 'kill', kind: here.mobs[0]!.key, count: 4, zone: here.zone });
    expect(foe).toMatchObject({ kind: 'hunt', goal: 4, what: here.mobs[0]!.key, x: here.mobs[0]!.x });
    expect(foe.title).toMatch(/^Hunt 4 /);
    const sites = offerFor(here, { t: 'gather', site: here.sites[0]!.kind, zone: here.zone, count: 2 });
    expect(sites).toMatchObject({ kind: 'gather', goal: 2 });
    const place = offerFor(here, { t: 'visit', place: here.places[0]!.name, zone: here.zone, count: 1 });
    expect(place).toMatchObject({ kind: 'visit', title: `Reach ${here.places[0]!.name}`, x: here.places[0]!.x });
    const gone = offerFor(here, { t: 'kill', kind: 'dragon', count: 1, zone: here.zone });
    expect(gone).toMatchObject({ kind: 'hunt', what: 'dragon' });
  });

  it('asks for spells only where the party can cast, and barrels only where there are barrels and a place', () => {
    expect(allOffers(land()).some((o) => o.kind === 'cast' || o.kind === 'haul')).toBe(false);
    const cast = allOffers(land({ casters: true })).find((o) => o.kind === 'cast');
    expect(cast).toMatchObject({ title: 'Cast 6 spells', goal: 6, zone: 'fen' });
    const haul = allOffers(land({ barrels: 5 })).find((o) => o.kind === 'haul');
    expect(haul).toMatchObject({ title: 'Carry 3 barrels to the Old Mill', goal: 3, what: 'the Old Mill', x: 700 });
    expect(allOffers(land({ barrels: 5, places: [] })).some((o) => o.kind === 'haul')).toBe(false);
    expect(allOffers(land({ barrels: 1 })).some((o) => o.kind === 'haul')).toBe(false);
  });

  it('hands a hero a step up in gear of the way they fight, never a leap and never a different style', () => {
    const hero = newHero(); // a plain blade
    const items: Record<string, Item> = {
      bronze: { name: 'Bronze Sword', value: 40, slot: 'weapon', attack: 3 },
      steel: { name: 'Steel Sword', value: 150, slot: 'weapon', attack: 5 },
      legend: { name: 'Legend Blade', value: 5000, slot: 'weapon', attack: 40 },
      bow: {
        name: 'Great Bow',
        value: 120,
        slot: 'weapon',
        attack: 9,
        ranged: { speed: 300, range: 256, cooldown: 0.5 },
      },
      cap: { name: 'Leather Cap', value: 30, slot: 'head', defense: 1 },
      bread: { name: 'Bread', value: 2, use: { hp: 5 } },
    };
    expect(['bronze', 'cap']).toContain(upgradeFor(hero, items, 1)); // steel is past a level 1 hero's means
    expect(upgradeFor(hero, items, 3, [], 0)).toBe('steel'); // the biggest step in reach, never the legend, never the bow
    expect(upgradeFor(hero, items, 3, [], 1)).toBe('cap'); // another quest, another slot
    expect(upgradeFor(hero, items, 3, ['weapon'])).toBe('cap'); // the blade was given last time
    hero.weapon = items.steel!;
    expect(upgradeFor(hero, items, 3)).toBe('cap'); // the blade is as good as it gets: armour next
    hero.head = items.cap;
    expect(upgradeFor(hero, items, 3)).toBeNull();
  });
});
