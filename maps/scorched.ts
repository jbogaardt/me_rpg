import { defineZone } from '../tools/map/zone';
import { DRY_TREES } from '../tools/map/catalog';
import { ridge } from '../tools/map/helpers';

// The Scorched Waste: the south-east of the world. A grassy approach from the west, then sand, dunes, an oasis, a buried
// skull and withered groves. Dune Raiders, orcs and the odd zombie live here.
// It sits on the world grid at cols 50-95, rows 27-71 (see `origin` in tools/map/zone.ts), so the coordinates below are
// world coordinates. The only way out is the gap in the western trees (rows 30-33), back to the Greenwood.
//
// Build with `npm run map -- build`; preview in maps/out/scorched.png.
export default defineZone({
  name: 'scorched',
  width: 46,
  height: 45,
  origin: { col: 50, row: 27 },
  build(z) {
    z.fill('grass');
    z.patch('sand', { col: 50, row: 35, w: 50, h: 40 }); // cols 51+, rows 36+

    // --- World border: three cells of darkness; a gap in the west --------------
    const dry = { trees: DRY_TREES };
    z.dark({ col: 50, row: 27, w: 49, h: 3 }); // north
    z.dark({ col: 47, row: 34, w: 6, h: 2 }); // west, green part (below the gap)
    z.dark({ col: 47, row: 36, w: 6, h: 36 }); // west, desert
    z.dark({ col: 94, row: 24, w: 5, h: 14 }); // east, green
    z.dark({ col: 94, row: 36, w: 5, h: 39 }); // east, desert
    z.dark({ col: 52, row: 70, w: 47, h: 5 }); // south
    for (let row = 30; row <= 33; row++) z.door(50, row, 1, 'greenwood', 47, row - 27); // back west to the Greenwood

    // --- The grass hub on the way in -----------------------------------------------------------------------------
    z.forest({ col: 62, row: 28, w: 8, h: 4 });
    z.forest({ col: 80, row: 30, w: 7, h: 4 });
    z.prop('treeA', 54, 31);
    z.prop('treeB', 74, 33);
    z.prop('bush', 58, 31);
    z.prop('bush', 90, 31);
    for (const [col, row] of [
      [53, 33],
      [72, 31],
      [76, 31],
      [66, 33],
    ])
      z.prop('rock', col, row);
    for (const [col, row] of [
      [60, 33],
      [84, 29],
      [56, 34],
    ])
      z.prop('flowerRed', col, row);

    // --- Dunes, a buried skull, an oasis, withered groves ---------------------------------------------------------
    z.stamp('skull', 62, 47);
    z.stamp('dune', 55, 58);
    z.stamp('crater', 84, 39);
    z.stamp('crater', 88, 60);
    z.stamp('dune', 66, 62);
    z.stamp('pit', 74, 44);
    z.stamp('pit', 80, 50);

    z.patch('water', { col: 74, row: 54, w: 12, h: 8 }); // oasis
    z.block({ col: 75, row: 55, w: 10, h: 6 }, 'oasis');
    z.prop('dryTreeA', 72, 58);
    z.prop('dryTreeB', 86, 53);
    z.prop('dryTreeA', 85, 64);
    z.prop('dryBush', 73, 53);
    z.prop('dryBush', 80, 63);
    z.prop('dryBush', 87, 58);

    z.forest({ col: 54, row: 38, w: 7, h: 4 }, dry);
    z.forest({ col: 68, row: 65, w: 10, h: 4 }, dry);
    z.forest({ col: 84, row: 66, w: 7, h: 3 }, dry);
    z.forest({ col: 76, row: 38, w: 5, h: 3 }, dry);
    ridge(z, 66, 43, 8);
    ridge(z, 58, 52, 5, true);
    ridge(z, 82, 48, 6);
    ridge(z, 54, 46, 4);
    ridge(z, 90, 50, 4, true);
    for (const [col, row] of [
      [66, 52],
      [90, 46],
      [60, 60],
      [86, 45],
      [70, 68],
      [57, 55],
      [78, 42],
    ])
      z.prop('dryBush', col, row);
    z.prop('dryTreeA', 70, 49);
    z.prop('dryTreeB', 57, 66);
    for (const [col, row] of [
      [70, 56],
      [78, 46],
      [90, 46],
      [60, 66],
      [52, 52],
      [92, 56],
    ])
      z.prop('rockC', col, row);
    for (const [col, row] of [
      [64, 55],
      [56, 63],
      [92, 66],
    ])
      z.prop('rockB', col, row);
    for (const [col, row] of [
      [72, 48],
      [89, 42],
      [60, 50],
    ])
      z.prop('rockSmall', col, row);
    z.spawn(53, 31); // never the start of the game; here so the zone has a reachable origin for checks
    for (const [kind, col, row] of [
      ['raider', 60, 55],
      ['orc', 70, 50],
      ['raider', 80, 46],
      ['zombie', 66, 59],
      ['orc', 88, 50],
    ] as const)
      z.mob(kind, col, row);

    // --- A mesa with a guarded chest or three --------------------------------------------------------------------
    z.plateau({ col: 62, row: 37, w: 8, h: 4 }, { kind: 'dry', stairs: [64] });
    z.prop('dryBush', 68, 38);
    z.prop('rockSmall', 65, 39);
    z.mob('raider', 66, 38);
    z.chest('iron', 'legionArmor', 67, 40);
    z.chest('iron', 'purse', 63, 40);
    z.chest('iron', 'parryingDagger', 63, 38);
  },
});
