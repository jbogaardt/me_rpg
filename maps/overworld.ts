import { defineZone } from '../tools/map/zone';
import { DRY_TREES, FROST_TREES } from '../tools/map/catalog';

// The whole known world: three biomes around a grassy hub. Build with `npm run map -- build`;
// preview in maps/out/overworld.png.
//
//   Frostlands  (north, rows 3-24)    snow, a frozen lake, frosted groves   - Frostbound
//   Greenwood   (south-west, spawn)   meadow, groves, a beach lake, ruins   - Shades
//   Scorched Waste (south-east)       sand, an oasis, dunes, a giant skull  - Dune Raiders
//
// Snow and sand both blend into grass, so the biomes never touch each other; grass bands keep them apart.
export default defineZone({
  name: 'overworld',
  width: 96,
  height: 72,
  build(z) {
    z.fill('grass');

    // Rock ridges: short walls with open ends, so the waste has corridors to fight in.
    const ridge = (
      col: number,
      row: number,
      len: number,
      vertical = false,
      kind: 'rockB' | 'rockC' | 'frostRockB' | 'frostRockC' = 'rockB',
    ) => {
      for (let i = 0; i < len; i++) {
        const alt = kind.startsWith('frost') ? (i % 2 ? 'frostRockC' : 'frostRockB') : i % 2 ? 'rockC' : 'rockB';
        z.prop(alt, col + (vertical ? 0 : i), row + (vertical ? i : 0));
      }
    };

    // --- Biome ground -------------------------------------------------------------------------------
    z.patch('snow', { col: -2, row: -2, w: 100, h: 28 }); // rows 0-24; the blended edge is row 25
    z.patch('sand', { col: 50, row: 35, w: 50, h: 40 }); // cols 51+, rows 36+

    // --- World border: three cells of trees, matched to the biome behind them ----------------------
    const frost = { trees: FROST_TREES };
    const dry = { trees: DRY_TREES };
    z.forest({ col: -3, row: -3, w: 102, h: 6 }, frost); // north
    z.forest({ col: -3, row: -3, w: 5, h: 29 }, frost); // west, frost part
    z.forest({ col: 94, row: -3, w: 5, h: 29 }, frost); // east, frost part
    z.forest({ col: -3, row: 24, w: 5, h: 51 }); // west, green
    z.forest({ col: 94, row: 24, w: 5, h: 14 }); // east, green
    z.forest({ col: 94, row: 36, w: 5, h: 39 }, dry); // east, desert
    z.forest({ col: -3, row: 70, w: 56, h: 5 }); // south, green
    z.forest({ col: 52, row: 70, w: 47, h: 5 }, dry); // south, desert

    // --- Greenwood (spawn): groves, a beach lake, an old cobbled plaza -----------------------------
    z.forest({ col: 22, row: 29, w: 9, h: 6 });
    z.forest({ col: 36, row: 31, w: 8, h: 5 });
    z.forest({ col: 4, row: 29, w: 8, h: 5 });
    z.forest({ col: 4, row: 58, w: 9, h: 6 });
    z.forest({ col: 16, row: 64, w: 12, h: 5 });
    z.forest({ col: 38, row: 61, w: 8, h: 7 });
    z.forest({ col: 31, row: 38, w: 4, h: 4 });

    z.patch('sand', { col: 17, row: 50, w: 15, h: 11 }); // the beach
    z.patch('water', { col: 19, row: 52, w: 11, h: 7 });
    z.block({ col: 20, row: 53, w: 9, h: 5 }, 'lake');

    z.patch('stone', { col: 36, row: 44, w: 9, h: 7 }); // ruins
    z.prop('barrel', 38, 46);
    z.prop('barrel', 42, 49);
    z.prop('rockC', 41, 45);
    z.prop('rockB', 37, 49);

    z.prop('bush', 12, 40);
    z.prop('bush', 26, 42);
    z.prop('bush', 44, 54, { dx: 2 });
    z.prop('bush', 9, 54);
    z.prop('treeA', 9, 37);
    z.prop('treeB', 33, 57);
    z.prop('treeB', 45, 40);
    z.prop('treeA', 7, 41);
    for (const [col, row] of [
      [10, 44],
      [20, 40],
      [34, 54],
      [24, 47],
      [41, 56],
      [6, 51],
    ])
      z.prop('flowerRed', col, row);
    for (const [col, row] of [
      [15, 46],
      [33, 40],
      [27, 62],
      [8, 61],
    ])
      z.prop('flowersPurple', col, row);
    for (const [col, row] of [
      [18, 44],
      [29, 48],
      [48, 52],
      [12, 54],
      [34, 66],
    ])
      z.prop('rock', col, row);
    z.prop('rockSmall', 22, 38);
    z.prop('rockC', 46, 37);

    z.prop('bush', 46, 47);
    z.prop('bush', 34, 52);
    z.prop('treeA', 5, 44);
    z.prop('treeB', 36, 58);
    z.prop('treeA', 48, 63);
    for (const [col, row] of [
      [30, 41],
      [36, 58],
      [14, 58],
      [47, 44],
    ])
      z.prop('flowerRed', col, row);
    for (const [col, row] of [
      [19, 62],
      [40, 52],
    ])
      z.prop('flowersPurple', col, row);
    z.spawn(8, 48);
    z.npc(13, 47);
    // Greenwood: level 1 fodder (goblins, a wolfkin, the odd shade).
    for (const [kind, col, row] of [
      ['goblin', 26, 38],
      ['goblin', 40, 38],
      ['shade', 30, 46],
      ['wolfkin', 24, 62],
      ['shade', 44, 58],
      ['goblin', 15, 60],
    ] as const)
      z.mob(kind, col, row);

    // --- Frostlands: a frozen lake in the middle, frosted groves to wander round ---------------------
    z.patch('ice', { col: 36, row: 8, w: 24, h: 12 });
    z.glare(37, 9); // a shine in the lake's north-west corner

    ridge(56, 22, 7, false, 'frostRockB');
    ridge(61, 4, 5, true, 'frostRockC');
    ridge(14, 24, 5, false, 'frostRockC');
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
    for (const [kind, col, row] of [
      ['frostbound', 34, 6],
      ['skeleton', 62, 12],
      ['wolfkin', 82, 12],
      ['frostbound', 50, 21],
      ['troll', 86, 22],
    ] as const)
      z.mob(kind, col, row);

    // --- Scorched Waste: dunes, a buried skull, an oasis, withered groves ---------------------------
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
    ridge(66, 43, 8);
    ridge(58, 52, 5, true);
    ridge(82, 48, 6);
    ridge(54, 46, 4);
    ridge(90, 50, 4, true);
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
    for (const [kind, col, row] of [
      ['raider', 60, 55],
      ['orc', 70, 50],
      ['raider', 80, 46],
      ['zombie', 66, 59],
      ['orc', 88, 50],
    ] as const)
      z.mob(kind, col, row);

    // --- Plateaus: raised ground with stairs up the south face (one per biome) ----------------------------
    // `rect` is the walkable top; the rim and the two face rows around it block. See z.plateau in tools/map/zone.ts.
    z.plateau({ col: 14, row: 28, w: 6, h: 5 }, { stairs: [16] }); // Greenwood overlook
    z.prop('rockSmall', 18, 29);
    z.prop('bush', 15, 31);
    for (const [col, row] of [
      [16, 29],
      [18, 31],
      [17, 30],
    ])
      z.prop(col === 17 ? 'flowersPurple' : 'flowerRed', col, row);
    z.mob('shade', 17, 31);

    // Treasure chests: a gift near the start, a restorative in the woods, and gear guarded on the ledges.
    z.chest('wood', 'bronzeSword', 10, 51);
    z.chest('wood', 'shortBow', 6, 50); // a bow to try right at the start
    z.chest('wood', 'clothHood', 11, 45);
    z.chest('wood', 'leatherBoots', 5, 46);
    z.chest('oak', 'elixir', 18, 30);
    z.chest('oak', 'woodenShield', 16, 28);
    z.chest('oak', 'leatherArmor', 14, 31);

    z.plateau({ col: 72, row: 13, w: 7, h: 4 }, { kind: 'frost', stairs: [75] }); // Frostlands ledge
    z.prop('frostRockC', 77, 14);
    z.prop('frostBush', 73, 15);
    z.mob('frostbound', 75, 14);
    z.chest('silver', 'steelSword', 73, 13);
    z.chest('silver', 'recurveBow', 77, 16);
    z.chest('silver', 'vikingHelm', 74, 13);

    z.plateau({ col: 62, row: 37, w: 8, h: 4 }, { kind: 'dry', stairs: [64] }); // Scorched Waste mesa
    z.prop('dryBush', 68, 38);
    z.prop('rockSmall', 65, 39);
    z.mob('raider', 66, 38);
    z.chest('iron', 'legionArmor', 67, 40);
    z.chest('iron', 'kiteShield', 63, 40);
    z.chest('iron', 'ironGreaves', 69, 38);
    z.chest('iron', 'parryingDagger', 63, 38);

    // --- The grass hub between the biomes ------------------------------------------------------------
    z.forest({ col: 62, row: 28, w: 8, h: 4 });
    z.forest({ col: 80, row: 30, w: 7, h: 4 });
    z.prop('treeA', 54, 31);
    z.prop('treeB', 74, 33);
    z.prop('bush', 58, 28);
    z.prop('bush', 90, 28);
    for (const [col, row] of [
      [52, 29],
      [72, 29],
      [76, 31],
      [66, 33],
    ])
      z.prop('rock', col, row);
    for (const [col, row] of [
      [60, 33],
      [84, 27],
      [56, 34],
    ])
      z.prop('flowerRed', col, row);
  },
});
