import { defineBiome, worldOf } from '../tools/map/world';
import { FROST_TREES } from '../tools/map/catalog';
import { awayFrom, blob, ridge, road } from '../tools/map/helpers';
import layout from './world';

// The Frostlands: the snowfields of the south-east. A frozen lake, frosted groves, a ledge with a hoard, and a long
// snowy plain along the bottom of the world. Ways in: from the marsh (north), the Eastwood (west) and the town (south-
// west). Frostbound, trolls and skeletons: level 4-7, the hardest place so far.
// World cells: cols 196-237 at rows 70-111, widening south to cols 147-237 at rows 147-160 (see maps/world.ts).

const W = worldOf(layout);
const marsh = W.gap('frostlands', 'marsh');
const east = W.gap('frostlands', 'eastwood');
const town = W.gap('frostlands', 'town');
const TRAILS = [
  ...road([
    [east.col, east.row],
    [marsh.col, east.row],
  ]), // in from the Eastwood
  ...road([
    [marsh.col, marsh.row],
    [marsh.col, 120],
  ]), // down from the marsh, past the lake
  ...road([
    [town.col, town.row],
    [200, town.row],
    [200, 120],
    [marsh.col, 120],
  ]), // in from the town
];

export default defineBiome({
  name: 'frostlands',
  walls: { trees: FROST_TREES },
  build(z) {
    z.fill('snow');
    z.paint('snow', z.bounds);
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(205, 98);

    // --- A frozen lake, slippery ------------------------------------------------------------------------------
    z.paint('ice', blob({ col: 176, row: 126, w: 22, h: 12 }));
    z.keepClear({ col: 174, row: 124, w: 26, h: 16 });

    // --- A ledge in the east with a hoard, guarded ------------------------------------------------------------
    z.plateau({ col: 220, row: 138, w: 9, h: 5 }, { kind: 'frost', stairs: [224] });
    z.prop('frostRockC', 227, 139);
    z.prop('frostBush', 221, 141);
    z.chest('silver', 'hoard', 222, 139);
    z.chest('silver', 'vikingHelm', 226, 141);
    z.chest('silver', 'backpack', 227, 141);
    z.mob('frostbound', 224, 140);

    for (const r of [
      { col: 200, row: 78, w: 8, h: 8 },
      { col: 220, row: 80, w: 9, h: 7 },
      { col: 222, row: 104, w: 9, h: 7 },
      { col: 180, row: 115, w: 9, h: 5 },
      { col: 160, row: 150, w: 10, h: 5 },
      { col: 205, row: 128, w: 8, h: 6 },
    ])
      z.forest(r, { trees: FROST_TREES });
    ridge(z, 230, 92, 5, true, 'frostRockB');
    ridge(z, 186, 146, 6, false, 'frostRockB');

    for (const [kind, col, row] of [
      ['frostbound', 210, 108],
      ['frostbound', 190, 120],
      ['skeleton', 226, 96],
      ['troll', 215, 148],
      ['wolfkin', 172, 145],
      ['frostbound', 230, 122],
      ['skeleton', 176, 154],
      ['troll', 195, 152],
      ['frostbound', 208, 76],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['frostTreeA', 'frostTreeB'], { count: 35, where: open, seed: 41 });
    z.scatter(['frostBush'], { count: 30, where: open, seed: 42 });
    z.scatter(['frostRock', 'frostRockB', 'frostRockC', 'frostRockSmall'], { count: 30, where: open, seed: 43 });
  },
});
