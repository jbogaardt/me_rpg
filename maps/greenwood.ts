import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, blob, pond, ridge, road } from '../tools/map/helpers';
import layout from './world';

// The Greenwood: the big forest of the south-west and where the game starts. Meadows and groves round a crossroads,
// an overlook with chests, old ruins, a lake, and roads to everywhere: north into the desert and the undead lands,
// east into the Eastwood, south to the town (two gates). Goblins, wolfkin and shades: level 1-2.
// World cells (maps/world.ts, 7 per square): the body is cols 0-146, rows 77-118; a western arm runs down to row 160
// and a northern glade up to row 42. Build with `npm run map -- build`; `npm run map -- layout greenwood` shows its walls.

const W = worldOf(layout);
const at = (b: string, n = 0) => {
  const g = W.gap('greenwood', b, n);
  return [g.col, g.row] as [number, number];
};

/** The roads, dirt on the grass: kept clear of scattered props. */
const ROADS = [
  ...road([[8, 93], at('eastwood')]), // the east-west road (the Eastwood gap is on it)
  ...road([at('desert'), [at('desert')[0], 93]]), // north to the desert
  ...road([at('undead'), [at('undead')[0], 93]]), // north to the undead lands
  ...road([[at('town')[0], 93], at('town')]), // south to the town's north road
  ...road([[56, 93], [56, at('town', 1)[1]], at('town', 1)]), // south-west, to its west gate
];

export default defineBiome({
  name: 'greenwood',
  walls: { trees: TREES },
  build(z) {
    z.fill('grass');
    z.paint('dirt', ROADS);
    z.keepClear(ROADS);
    const open = awayFrom(ROADS);

    // --- The crossroads: where the game starts ---------------------------------------------------------------
    z.spawn(98, 99);
    z.npc(102, 99);
    z.chest('wood', 'coins', 95, 101);
    z.chest('wood', 'sack', 97, 102); // more pack slots, close to the start
    z.prop('barrel', 104, 100);
    z.prop('barrel', 105, 101);
    z.keepClear({ col: 92, row: 97, w: 16, h: 8 });

    // --- An overlook in the west: raised ground with stairs, and chests on top ---------------------------------
    z.plateau({ col: 16, row: 100, w: 8, h: 5 }, { stairs: [19] });
    z.prop('rockSmall', 17, 103);
    z.chest('oak', 'elixir', 21, 101);
    z.chest('oak', 'purse', 18, 101);
    z.chest('oak', 'bandageKit', 22, 103);
    z.mob('shade', 19, 102);

    // --- Old ruins: a cobbled square with what is left of it ---------------------------------------------------
    z.patch('stone', { col: 34, row: 100, w: 11, h: 8 });
    z.keepClear({ col: 33, row: 99, w: 13, h: 10 });
    z.prop('barrel', 36, 102);
    z.prop('rockC', 41, 101);
    z.prop('rockB', 35, 105);
    z.prop('menhir', 39, 104);
    z.chest('wood', 'whetstone', 42, 105);
    z.mob('goblin', 38, 103);

    // --- The old lake in the south-west, a sandy shore round it ------------------------------------------------
    const lake = pond(z, { col: 14, row: 126, w: 18, h: 10 }, { shore: 'sand' });
    z.keepClear({ col: 11, row: 123, w: 24, h: 16 });
    z.prop('lilyFlower', lake[3].col + 2, lake[3].row);
    z.prop('lilyPads', lake[5].col + 8, lake[5].row);
    z.prop('lilyRed', lake[6].col + 12, lake[6].row);
    z.prop('reeds', lake[8].col + 1, lake[8].row);

    // --- A grassy hill in the far south-west --------------------------------------------------------------------
    z.plateau({ col: 22, row: 146, w: 7, h: 5 }, { stairs: [25] });
    z.chest('oak', 'relic', 24, 147);
    z.mob('wolfkin', 26, 149);

    // --- The northern glade, between the desert and the undead lands --------------------------------------------
    z.paint('meadow', blob({ col: 50, row: 56, w: 18, h: 14 }));
    z.chest('oak', 'potion', 60, 58);
    z.mob('shade', 62, 66);

    // --- Groves, so the meadow is not one big field -----------------------------------------------------------
    for (const r of [
      { col: 25, row: 82, w: 9, h: 5 },
      { col: 60, row: 80, w: 12, h: 6 },
      { col: 82, row: 82, w: 10, h: 5 },
      { col: 126, row: 80, w: 12, h: 7 },
      { col: 64, row: 104, w: 10, h: 7 },
      { col: 100, row: 108, w: 12, h: 6 },
      { col: 130, row: 100, w: 8, h: 10 },
      { col: 6, row: 112, w: 8, h: 8 },
      { col: 40, row: 120, w: 10, h: 8 },
      { col: 84, row: 121, w: 10, h: 4 },
      { col: 32, row: 148, w: 12, h: 6 },
      { col: 8, row: 150, w: 10, h: 5 },
      { col: 48, row: 60, w: 6, h: 4 },
    ])
      z.forest(r);
    ridge(z, 74, 112, 6);
    ridge(z, 30, 112, 4, true);

    // Level 1-2 fodder: goblins near the start, wolfkin and shades further out.
    for (const [kind, col, row] of [
      ['goblin', 80, 99],
      ['goblin', 112, 88],
      ['goblin', 44, 88],
      ['goblin', 118, 104],
      ['goblin', 30, 96],
      ['wolfkin', 136, 90],
      ['wolfkin', 12, 140],
      ['wolfkin', 48, 132],
      ['wolfkin', 90, 128],
      ['shade', 76, 116],
      ['shade', 36, 86],
      ['shade', 52, 150],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['treeA', 'treeB'], { count: 45, where: open, seed: 11 });
    z.scatter(['bush'], { count: 60, where: open, seed: 12 });
    z.scatter(['rock', 'rockSmall', 'rockB', 'rockC'], { count: 35, where: open, seed: 13 });
    z.scatter(['flowerRed', 'flowersPurple'], { count: 120, where: open, margin: 0, seed: 14 });
  },
});
