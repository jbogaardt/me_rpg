import { defineZone } from '../tools/map/zone';
import { FROST_TREES } from '../tools/map/catalog';
import { ridge } from '../tools/map/helpers';

// The Frostlands: the north of the world. Snow, a frozen lake, frosted groves, a ledge with a hoard. Frostbound live here.
// It sits on the world grid at rows 0-26 (see `origin` in tools/map/zone.ts), so the coordinates below are the same ones
// the whole world uses. The only way out is a gap in the southern trees (cols 31-36) that leads down into the Greenwood.
//
// Build with `npm run map -- build`; preview in maps/out/frostlands.png.
export default defineZone({
  name: 'frostlands',
  width: 96,
  height: 27,
  origin: { col: 0, row: 0 },
  build(z) {
    z.fill('grass');
    z.patch('snow', { col: -2, row: -2, w: 100, h: 28 }); // rows 0-24; the blended edge is row 25

    // --- World border: darkness; a gap in the south is the way to the Greenwood ----------------
    const frost = { trees: FROST_TREES };
    z.darkness({ col: -3, row: -3, w: 102, h: 6 }); // north
    z.darkness({ col: -3, row: -3, w: 5, h: 30 }); // west
    z.darkness({ col: 94, row: -3, w: 5, h: 30 }); // east
    z.darkness({ col: -3, row: 24, w: 34, h: 3 }); // south, west of the gap
    z.darkness({ col: 37, row: 24, w: 62, h: 3 }); // south, east of the gap
    z.door(32, 26, 4, 'greenwood', 33, 3); // down to the Greenwood (arrive 3 rows inside its north edge)

    // --- A frozen lake in the middle, frosted groves to wander round ------------------------------------------
    z.patch('ice', { col: 36, row: 8, w: 24, h: 12 });
    z.glare(37, 9); // a shine in the lake's north-west corner

    ridge(z, 56, 22, 7, false, 'frostRockB');
    ridge(z, 61, 4, 5, true, 'frostRockC');
    z.prop('frostBush', 70, 22);
    z.prop('frostBush', 38, 22);
    z.prop('frostTreeA', 53, 6);
    z.prop('frostTreeB', 66, 14);
    z.prop('frostBush', 22, 20);
    z.forest({ col: 6, row: 6, w: 11, h: 6 }, frost);
    z.forest({ col: 6, row: 17, w: 8, h: 5 }, frost);
    z.forest({ col: 22, row: 14, w: 7, h: 5 }, frost);
    z.forest({ col: 24, row: 5, w: 8, h: 4 }, frost);
    z.forest({ col: 68, row: 6, w: 12, h: 6 }, frost);
    z.forest({ col: 82, row: 14, w: 9, h: 6 }, frost);
    z.forest({ col: 66, row: 19, w: 8, h: 4 }, frost);
    z.forest({ col: 40, row: 21, w: 7, h: 3 }, frost);

    z.prop('frostTreeA', 19, 12);
    z.prop('frostTreeB', 33, 21);
    z.prop('frostTreeA', 62, 9);
    z.prop('frostTreeB', 78, 20);
    z.prop('frostTreeA', 12, 14, { dx: 2 });
    z.prop('frostBush', 30, 11);
    z.prop('frostBush', 63, 16);
    z.prop('frostBush', 52, 22);
    z.prop('frostBush', 88, 8);
    z.prop('frostBush', 17, 22);
    for (const [col, row] of [
      [20, 9],
      [31, 17],
      [64, 13],
      [58, 22],
      [90, 20],
      [10, 13],
      [84, 9],
    ])
      z.prop('frostRock', col, row);
    for (const [col, row] of [
      [27, 22],
      [72, 10],
      [46, 5],
      [14, 9],
    ])
      z.prop('frostRockC', col, row);
    for (const [col, row] of [
      [34, 15],
      [66, 4],
    ])
      z.prop('frostRockSmall', col, row);
    z.spawn(33, 23); // never the start of the game; here so the zone has a reachable origin for checks
    for (const [kind, col, row] of [
      ['frostbound', 34, 6],
      ['skeleton', 62, 12],
      ['wolfkin', 82, 12],
      ['frostbound', 50, 21],
      ['troll', 86, 22],
    ] as const)
      z.mob(kind, col, row);

    // --- A ledge in the east with a hoard, guarded --------------------------------------------------------------
    z.plateau({ col: 72, row: 13, w: 7, h: 4 }, { kind: 'frost', stairs: [75] });
    z.prop('frostRockC', 77, 14);
    z.prop('frostBush', 73, 15);
    z.mob('frostbound', 75, 14);
    z.chest('silver', 'hoard', 73, 13);
    z.chest('silver', 'vikingHelm', 74, 13);
    z.chest('silver', 'backpack', 73, 16);
  },
});
