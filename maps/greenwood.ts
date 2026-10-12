import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
import layout from './world';

// The Greenwood: the big forest of the south-west and where the game starts. Meadows and groves round a crossroads,
// an overlook and a hill with chests, ruins, two lakes, and trails to everywhere: north into the desert and the undead
// lands, east into the Eastwood, south to the town (two gates). Goblins, wolfkin and shades: level 1-2.
// Placed in squares of maps/world.ts (`units`): the body is squares x 0-20, y 11-16, with an arm down the west to
// y 22 and a glade up to y 6. `npm run map -- layout greenwood` shows its walls and gaps.

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string, n = 0): [number, number] => {
  const g = W.gap('greenwood', to, n);
  return [g.col, g.row];
};
const [east, desert, undead, town, townWest] = [
  gap('eastwood'),
  gap('desert'),
  gap('undead'),
  gap('town', 0),
  gap('town', 1),
];
const SPINE = 140; // the east-west trail's row
const TRAILS = [
  ...trail([[14, SPINE], [190, SPINE], [190, east[1]], east]),
  ...trail([desert, [desert[0], SPINE]]),
  ...trail([undead, [undead[0], SPINE]]),
  ...trail([[town[0], SPINE], town]),
  ...trail([[80, SPINE], [80, townWest[1]], townWest]),
];

export default defineBiome({
  name: 'greenwood',
  climate: 'temperate',
  walls: { trees: TREES },
  build(z) {
    z.fill('grass');
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));

    // --- The crossroads: where the game starts ---------------------------------------------------------------
    z.spawn(...near(14, 15));
    z.npc(...near(14.4, 15));
    z.chest('wood', 'coins', ...near(13.6, 15.3));
    z.chest('wood', 'sack', ...near(13.8, 15.5)); // more pack slots, close to the start
    z.prop('barrel', ...near(14.8, 14.6));
    z.prop('barrel', ...near(14.9, 14.7));
    z.keepClear(area(13.2, 14.4, 2.2, 1.5));

    // --- An overlook in the west: raised ground with stairs, and chests on top ---------------------------------
    z.plateau({ col: 30, row: 152, w: 9, h: 5 }, { stairs: [34] });
    z.prop('rockSmall', 31, 155);
    z.chest('oak', 'elixir', 36, 153);
    z.chest('oak', 'purse', 32, 153);
    z.chest('oak', 'bandageKit', 37, 155);
    z.mob('shade', 34, 154);

    // --- Old ruins: cracked flags in the grass and what is left standing ----------------------------------------
    for (const r of blob(area(5, 11.8, 1.6, 1))) z.fill('crackedStone', r);
    z.keepClear(area(4.8, 11.6, 2, 1.4));
    for (const [x, y] of [
      [5.3, 12.1],
      [6.2, 12.0],
      [5.6, 12.6],
    ] as const)
      z.prop('menhir', ...at(x, y));
    z.chest('wood', 'whetstone', ...near(5.9, 12.4));
    z.mob('goblin', ...near(5.8, 12.2));

    // --- The old lake in the south-west, and a pond further down ----------------------------------------------
    const lake = pond(z, area(1.6, 17.6, 3, 1.8), { shore: 'sand' });
    z.keepClear(area(1.3, 17.3, 3.6, 2.4));
    z.prop('lilyFlower', pick(lake, 4).col + 2, pick(lake, 4).row);
    z.prop('lilyPads', pick(lake, 7).col + 9, pick(lake, 7).row);
    z.prop('lilyRed', pick(lake, 9).col + 15, pick(lake, 9).row);
    reedsAt(z, lake, 13, 'w');
    const small = pond(z, area(6, 21, 1.4, 0.9), { shore: 'meadow' });
    z.keepClear(area(5.7, 20.7, 2, 1.5));
    z.prop('lilyPads', pick(small, 3).col + 3, pick(small, 3).row);

    // --- A grassy hill in the far south-west ------------------------------------------------------------------
    z.plateau({ col: 40, row: 196, w: 8, h: 5 }, { stairs: [43] });
    z.chest('oak', 'relic', 45, 197);
    z.mob('wolfkin', 42, 198);

    // --- The northern glade, between the desert and the undead lands --------------------------------------------
    z.paint('meadow', blob(area(6.4, 7.4, 3.6, 2.8)));
    z.chest('oak', 'potion', ...near(8.2, 8.2));
    z.mob('shade', ...near(7.6, 9));
    z.mob('goblin', ...near(8.6, 9.6));

    // --- Groves, so the meadow is not one big field -----------------------------------------------------------
    for (const [x, y, w, h] of [
      [3, 11.6, 2, 1],
      [8, 11.4, 2.4, 1.2],
      [11, 11.5, 2, 1],
      [17, 11.4, 2.2, 1.4],
      [9, 14.6, 2.2, 1.6],
      [16.5, 14.6, 1.8, 1.6],
      [0.6, 15.2, 1.6, 2],
      [5, 15.4, 2.4, 1.4],
      [11, 16.6, 2.4, 1.6],
      [6.4, 18.6, 2, 1.6],
      [0.6, 20.2, 2.6, 1.4],
      [3.4, 21.3, 2.2, 1.2],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: TREES });

    // Level 1-2 fodder: goblins near the start, wolfkin and shades further out.
    for (const [kind, x, y] of [
      ['goblin', 12, 14.6],
      ['goblin', 16, 12.4],
      ['goblin', 6, 13.2],
      ['goblin', 17, 15.6],
      ['goblin', 3.6, 13.6],
      ['goblin', 10, 12.4],
      ['wolfkin', 19.6, 12.2],
      ['wolfkin', 1.6, 19.6],
      ['wolfkin', 7, 17.6],
      ['wolfkin', 12.6, 16.2],
      ['wolfkin', 4.4, 22],
      ['shade', 10.6, 15.8],
      ['shade', 4.4, 11.8],
      ['shade', 7.6, 20.4],
      ['shade', 19.4, 16],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter([...TREES], { count: 70, where: open, seed: 11 });
    z.scatter(['bush'], { count: 36, where: open, seed: 12 });
    z.scatter(['rock', 'rockSmall', 'rockB', 'rockC'], { count: 45, where: open, seed: 13 });
    z.scatter(['flowerRed', 'flowersPurple'], { count: 220, where: open, margin: 0, seed: 14 });
  },
});
