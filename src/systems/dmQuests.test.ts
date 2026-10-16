import { describe, expect, it } from 'vitest';
import { allOffers, offerFor, relicsFor, type Land } from './dmQuests';

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
      'Hunt 5 Goblins',
      'Hunt 3 Trolls',
      'Gather 3 Echostones',
      'Reach the Old Mill',
      'Find the Wayfarer’s Charm',
    ]);
    expect(offers.find((o) => o.kind === 'hunt')).toMatchObject({ what: 'goblin', goal: 5, zone: 'fen', x: 10, y: 20 });
    expect(offers.find((o) => o.kind === 'find')).toMatchObject({ what: 'charm', goal: 1, x: 900, y: 910 });
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
});
