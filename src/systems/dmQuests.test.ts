import { xpToNext } from './combat';
import { describe, expect, it } from 'vitest';
import { newHero, type Item } from './combat';
import {
  allOffers,
  huntGoal,
  goldScale,
  masteryWhat,
  offerFor,
  offerReward,
  parseMastery,
  parseRelicWhat,
  questOf,
  relicsFor,
  relicWhat,
  upgradeFor,
  type Land,
} from './dmQuests';
import { BOSS_KEY, bossStats, parseBossWhat } from './dmBoss';
import { castIn, killIn } from './quests';

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
      expect.stringMatching(/^Slay the .*Troll/), // the boss: the toughest foe the land has
      'Open the chest holding the Wayfarer’s Charm',
      'Take the Wayfarer’s Charm from a Goblin',
    ]);
    expect(offers.find((o) => o.kind === 'hunt')).toMatchObject({ what: 'goblin', goal: 3, zone: 'fen', x: 10, y: 20 });
    expect(offers.find((o) => o.kind === 'find')).toMatchObject({ what: 'charm', goal: 1, x: 900, y: 910 });
  });

  it('never leaves a relic lying about: a chest holds it, or a foe carries it and drops it when it falls', () => {
    const finds = allOffers(land()).filter((o) => o.kind === 'find');
    const [chest, carried] = finds.map((o) => questOf(o).objective);
    expect(chest).toMatchObject({ t: 'gather', site: 'relic' });
    expect(carried).toMatchObject({ t: 'kill', kind: 'goblin', count: 1 });
    expect(parseRelicWhat(finds[1]!.what)).toEqual({ item: 'charm', carrier: 'goblin' });
    expect(parseRelicWhat(relicWhat('charm'))).toEqual({ item: 'charm' });
    expect(allOffers(land({ mobs: [] })).filter((o) => o.kind === 'find')).toHaveLength(1); // no foe: the chest only
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
    expect(goldScale(1)).toBe(1);
    expect(offerReward('hunt', 5, 8).xp).toBeGreaterThan(offerReward('hunt', 5, 1).xp * 5); // a share of a bigger level
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

describe('a boss quest', () => {
  const boss = (l: Partial<Land> = {}) => allOffers(land(l)).find((o) => o.kind === 'boss');

  it('is the toughest foe the land has, made for the party, and waits at the land’s own spot', () => {
    const o = boss({ level: 5, party: 3 })!;
    expect(o).toMatchObject({ zone: 'fen', goal: 1, x: 900, y: 910, level: 5 });
    expect(parseBossWhat(o.what)).toEqual({ key: 'troll', maxHp: bossStats(5, 3).maxHp });
    expect(o.title).toMatch(/^Slay the .*Troll/);
    expect(boss({ level: 5, party: 3 })!.title).toBe(o.title); // the same name each time it is offered
    expect(parseBossWhat(boss({ level: 5, party: 1 })!.what)!.maxHp).toBeLessThan(parseBossWhat(o.what)!.maxHp);
  });

  it('is only offered where there is a foe to make it of and a spot to put it', () => {
    expect(boss({ mobs: [] })).toBeUndefined();
    expect(boss({ spot: () => null })).toBeUndefined();
  });

  it('pays more than a hunt, scaled by level, and is counted as the one kill of the boss', () => {
    expect(offerReward('boss', 1, 1).xp).toBeGreaterThan(offerReward('hunt', 5, 1).xp);
    expect(offerReward('boss', 1, 1).gold).toBeGreaterThan(offerReward('hunt', 5, 1).gold);
    expect(offerReward('boss', 1, 8).xp).toBeGreaterThan(offerReward('boss', 1, 1).xp * 5);
    const q = questOf(boss()!);
    expect(q.objective).toEqual({ t: 'kill', kind: BOSS_KEY, count: 1, zone: 'fen' });
    const log = { stage: 0, taken: true, progress: 0 };
    expect(killIn(log, q, 'troll', 'fen')).toBe(false); // an ordinary troll is not it
    expect(killIn(log, q, BOSS_KEY, 'fen')).toBe(true);
  });
});

describe('a mastery quest', () => {
  const combos = [
    { spell: 'bolt', name: 'Arcane Bolt', keys: 'uurl' },
    { spell: 'nova', name: 'Nova', keys: 'dlurd' },
  ];

  it('is offered once for each spell the party’s wands and tomes teach, and not where there are none', () => {
    const offers = allOffers(land({ combos })).filter((o) => o.kind === 'master');
    expect(offers.map((o) => o.title)).toEqual(['Master Arcane Bolt: cast it 3 times', 'Master Nova: cast it 3 times']);
    expect(offers[0]).toMatchObject({ goal: 3, what: 'bolt:uurl', zone: 'fen' });
    expect(allOffers(land()).some((o) => o.kind === 'master')).toBe(false);
    expect(allOffers(land({ combos: [] })).some((o) => o.kind === 'master')).toBe(false);
  });

  it('counts only casts of the spell it names, and pays more than casting anything', () => {
    expect(parseMastery(masteryWhat('bolt', 'uurl'))).toEqual({ spell: 'bolt', keys: 'uurl' });
    expect(parseMastery('bolt')).toBeNull();
    expect(parseMastery('bolt:xyz')).toBeNull();
    const q = questOf(allOffers(land({ combos })).find((o) => o.kind === 'master')!);
    expect(q.objective).toEqual({ t: 'cast', zone: 'fen', count: 3, spell: 'bolt' });
    const log = { stage: 0, taken: true, progress: 0 };
    expect(castIn(log, q, 'fen', 'nova')).toBe(false);
    expect(castIn(log, q, 'fen')).toBe(false);
    expect(castIn(log, q, 'fen', 'bolt')).toBe(true);
    expect(offerReward('master', 3, 1).xp).toBeGreaterThan(offerReward('cast', 3, 1).xp);
  });

  it('pays a share of the level and gold the shops can spend, at every level (never thousands)', () => {
    for (const level of [1, 5, 10, 20, 30, 50]) {
      const need = xpToNext(level);
      for (const kind of ['hunt', 'gather', 'find', 'visit', 'cast', 'haul', 'master', 'forge'] as const) {
        const r = offerReward(kind, 5, level);
        expect(r.xp, `${kind} xp at ${level}`).toBeLessThan(need * 0.5);
        expect(r.gold, `${kind} gold at ${level}`).toBeLessThan(250);
      }
      expect(offerReward('boss', 1, level).xp, `boss at ${level}`).toBeLessThanOrEqual(Math.max(1, need * 0.5) + 1);
      expect(offerReward('boss', 1, level).gold, `boss gold at ${level}`).toBeLessThan(400);
    }
    expect(offerReward('hunt', 5, 30).gold).toBeLessThan(150); // a level 30 hunt buys a good piece, not a shop
  });
});
