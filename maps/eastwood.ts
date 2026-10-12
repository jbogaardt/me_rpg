import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
import layout from './world';

// The Eastwood: the second forest, east of the Greenwood. Deeper green and wilder: dense groves, a woodland pond, a
// wooded hill with a view, and a long tongue of forest running south with a chest at its end. Trails lead west to the
// Greenwood, north up into the jungle and east into the Frostlands. Wolfkin, goblins, skeletons and shades: level 2-3.
// Squares x 21-27, y 11-15, narrowing south to y 20 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('eastwood', to);
  return [g.col, g.row];
};
const [west, east, north] = [gap('greenwood'), gap('frostlands'), gap('jungle')];
const TRAILS = [
  ...trail([west, east]),
  ...trail([north, [north[0], west[1]]]),
  ...trail([
    [222, west[1]],
    [222, 196],
  ]), // south down the tongue
];

export default defineBiome({
  name: 'eastwood',
  climate: 'temperate',
  walls: { trees: TREES },
  build(z) {
    z.fill('grass');
    z.ground('meadow'); // deeper green than the Greenwood's
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(23.4, 14));
    z.pet('dog_black', ...near(24.6, 14.6));

    // --- A wooded hill with chests on top ---------------------------------------------------------------------
    z.plateau({ col: 252, row: 118, w: 9, h: 5 }, { stairs: [256] });
    z.prop('bush', 258, 119);
    z.chest('oak', 'purse', 253, 119);
    z.chest('oak', 'potion', 259, 121);
    z.mob('skeleton', 256, 120);

    // --- A woodland pond --------------------------------------------------------------------------------------
    const water = pond(z, area(25, 14.2, 1.6, 1), { shore: 'mud' });
    z.keepClear(area(24.7, 13.9, 2.2, 1.6));
    z.prop('lilyFlower', pick(water, 3).col + 2, pick(water, 3).row);
    reedsAt(z, water, 8, 'e', 'reedStalks');

    // --- The end of the tongue: a hidden clearing --------------------------------------------------------------
    z.chest('iron', 'relic', ...near(21.6, 20));
    z.mob('wolfkin', ...near(22.4, 19));

    for (const [x, y, w, h] of [
      [21.4, 11.6, 1.4, 1.2],
      [23.4, 14.4, 1.4, 1.2],
      [26.2, 11.5, 1.2, 1],
      [21.4, 15.2, 0.6, 1.6],
      [23, 16.4, 1.4, 1.2],
      [22.6, 18.2, 0.8, 1],
      [26.5, 15.2, 0.9, 0.6],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: TREES });

    for (const [kind, x, y] of [
      ['wolfkin', 21.6, 14],
      ['wolfkin', 26.6, 14.8],
      ['goblin', 23.8, 12],
      ['goblin', 26.4, 12.8],
      ['shade', 21.8, 17.2],
      ['skeleton', 24.2, 15.4],
      ['shade', 23.4, 18],
      ['wolfkin', 25.2, 12.4],
      ['goblin', 22.4, 16.2],
      ['skeleton', 27.2, 14.2],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter([...TREES], { count: 40, where: open, seed: 31 });
    z.scatter(['bush'], { count: 16, where: open, seed: 32 });
    z.scatter(['rock', 'rockB', 'rockC', 'rockSmall'], { count: 24, where: open, seed: 33 });
    z.scatter(['flowersPurple', 'flowerRed'], { count: 70, where: open, margin: 0, seed: 34 });

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place('The Wooded Hill', 256, 120);
    z.place('Woodland Pond', 258, 143);
    z.place('The Hidden Clearing', 216, 200);
  },
});
