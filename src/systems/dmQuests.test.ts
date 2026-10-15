import { describe, expect, it } from 'vitest';
import { allOffers, relicsFor, type Land } from './dmQuests';

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
