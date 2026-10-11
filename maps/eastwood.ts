import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, ridge, road } from '../tools/map/helpers';
import layout from './world';

// The Eastwood: the second forest, east of the Greenwood. Deeper green and wilder: dense groves, a wooded hill with a
// view, and a long tongue of forest running south with a chest at its end. Roads lead west to the Greenwood, north up
// into the jungle and east into the Frostlands. Wolfkin, goblins, skeletons and shades: level 2-3.
// World cells: cols 147-195, rows 77-111, narrowing south to row 146 (see maps/world.ts).

const W = worldOf(layout);
const west = W.gap('eastwood', 'greenwood');
const east = W.gap('eastwood', 'frostlands');
const north = W.gap('eastwood', 'jungle');
const TRAILS = [
  ...road([
    [west.col, west.row],
    [east.col, east.row],
  ]), // Greenwood to Frostlands
  ...road([
    [north.col, north.row],
    [north.col, west.row],
  ]), // up to the jungle
  ...road([
    [154, west.row],
    [154, 140],
  ]), // south down the tongue
];

export default defineBiome({
  name: 'eastwood',
  walls: { trees: TREES },
  build(z) {
    z.fill('grass');
    z.paint('meadow', z.bounds); // deeper green than the Greenwood's
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(165, 98);

    // --- A wooded hill with chests on top ---------------------------------------------------------------------
    z.plateau({ col: 177, row: 81, w: 8, h: 5 }, { stairs: [180] });
    z.prop('bush', 182, 82);
    z.chest('oak', 'purse', 178, 82);
    z.chest('oak', 'potion', 183, 84);
    z.mob('skeleton', 180, 83);

    // --- The end of the tongue: a hidden clearing --------------------------------------------------------------
    z.chest('iron', 'relic', 151, 142);
    z.mob('wolfkin', 157, 134);

    for (const r of [
      { col: 158, row: 100, w: 8, h: 7 },
      { col: 170, row: 99, w: 9, h: 6 },
      { col: 183, row: 100, w: 7, h: 8 },
      { col: 150, row: 82, w: 6, h: 7 },
      { col: 158, row: 116, w: 7, h: 6 },
      { col: 186, row: 82, w: 5, h: 5 },
    ])
      z.forest(r);
    ridge(z, 162, 86, 5);
    ridge(z, 190, 96, 4, true);

    for (const [kind, col, row] of [
      ['wolfkin', 152, 102],
      ['wolfkin', 178, 108],
      ['goblin', 166, 90],
      ['goblin', 186, 90],
      ['shade', 150, 125],
      ['skeleton', 167, 110],
      ['shade', 160, 128],
      ['wolfkin', 175, 89],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['treeA', 'treeB'], { count: 13, where: open, seed: 31 });
    z.scatter(['bush'], { count: 6, where: open, seed: 32 });
    z.scatter(['rock', 'rockB', 'rockC', 'rockSmall'], { count: 16, where: open, seed: 33 });
    z.scatter(['flowersPurple', 'flowerRed'], { count: 40, where: open, margin: 0, seed: 34 });
  },
});
