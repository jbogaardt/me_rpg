import { defineBiome, worldOf } from '../tools/map/world';
import { DRY_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pond, ridge, road } from '../tools/map/helpers';
import layout from './world';

// The desert: the whole north-west, stepping down to the Greenwood in a staircase of withered trees. Dunes, a buried
// skull, red badlands, an oasis, and a mesa with the legion's lost gear. A trail runs from the Greenwood (south) to the
// beach (east). Dune raiders, orcs and the odd zombie: level 3-5.
// World cells: cols 0-97 at rows 0-27, stepping down to cols 0-20 at rows 77-83 (see maps/world.ts).

const W = worldOf(layout);
const south = W.gap('desert', 'greenwood');
const east = W.gap('desert', 'beach');
const TRAILS = road([
  [south.col, south.row],
  [south.col, 40],
  [30, 40],
  [30, east.row],
  [east.col, east.row],
]);

export default defineBiome({
  name: 'desert',
  walls: { trees: DRY_TREES },
  build(z) {
    z.fill('sand');
    z.paint('redDirt', [
      ...blob({ col: 4, row: 3, w: 20, h: 12 }),
      ...blob({ col: 58, row: 3, w: 24, h: 10 }),
      ...blob({ col: 12, row: 50, w: 18, h: 12 }),
    ]);
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(14, 70);

    // --- A mesa in the badlands with the legion's lost gear ---------------------------------------------------
    z.plateau({ col: 8, row: 5, w: 9, h: 5 }, { kind: 'dry', stairs: [12] });
    z.prop('dryBush', 14, 6);
    z.chest('iron', 'legionArmor', 15, 9);
    z.chest('iron', 'purse', 9, 9);
    z.chest('iron', 'parryingDagger', 9, 6);
    z.mob('raider', 12, 7);

    // --- An oasis --------------------------------------------------------------------------------------------
    const water = pond(z, { col: 52, row: 28, w: 12, h: 7 }, { shore: 'meadow' });
    z.keepClear({ col: 48, row: 25, w: 20, h: 13 });
    z.prop('dryTreeA', 49, 28);
    z.prop('dryTreeB', 64, 35);
    z.prop('reeds', water[5].col + 1, water[5].row);
    z.prop('lilyFlower', water[2].col + 2, water[2].row);
    z.prop('lilyPads', water[3].col + 6, water[3].row);
    z.chest('wood', 'potion', 66, 30);

    // --- Dunes, the skull, craters ---------------------------------------------------------------------------
    z.stamp('skull', 44, 5);
    z.stamp('dune', 72, 20);
    z.stamp('dune', 10, 28);
    z.stamp('dune', 38, 52);
    z.stamp('crater', 86, 6);
    z.stamp('crater', 22, 64);
    z.stamp('pit', 40, 34);
    z.stamp('pit', 75, 9);
    z.stamp('pit', 6, 45);
    z.keepClear([
      { col: 44, row: 5, w: 4, h: 5 },
      { col: 86, row: 6, w: 3, h: 3 },
      { col: 22, row: 64, w: 3, h: 3 },
    ]);
    z.forest({ col: 4, row: 20, w: 8, h: 4 }, { trees: DRY_TREES });
    z.forest({ col: 42, row: 20, w: 6, h: 4 }, { trees: DRY_TREES });
    z.forest({ col: 70, row: 34, w: 8, h: 4 }, { trees: DRY_TREES });
    ridge(z, 60, 22, 6);
    ridge(z, 38, 44, 5, true);

    for (const [kind, col, row] of [
      ['raider', 40, 14],
      ['raider', 70, 12],
      ['raider', 20, 46],
      ['raider', 80, 30],
      ['orc', 55, 18],
      ['orc', 18, 30],
      ['zombie', 58, 40],
      ['raider', 6, 60],
      ['orc', 30, 66],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['dryTreeA', 'dryTreeB'], { count: 14, where: open, seed: 53 });
    z.scatter(['sandBoulder', 'sandBoulderB', 'sandSpire'], { count: 24, where: open, seed: 51 });
    z.scatter(['dryBush'], { count: 40, where: open, seed: 52 });
    z.scatter(['rockC', 'rockB', 'rockSmall'], { count: 20, where: open, seed: 54 });
  },
});
