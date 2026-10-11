import { defineZone } from '../tools/map/zone';

// The Greenwood: the south-west of the world and where the game starts. A meadow with groves, a beach lake, old ruins,
// an overlook with chests, and the gate to the town. Goblins, wolfkin and shades live here.
// It sits on the world grid at cols 0-49, rows 27-71 (see `origin` in tools/map/zone.ts), so the coordinates below are
// world coordinates. Exits: north (cols 32-35) up to the Frostlands, east (rows 30-33) across to the Scorched Waste, and
// the town gate (cols 22-24 at row 36).
//
// Build with `npm run map -- build`; preview in maps/out/greenwood.png.
export const GATE = { door: { col: 22, row: 36, w: 3 }, outside: { col: 23, row: 41 } } as const;

export default defineZone({
  name: 'greenwood',
  width: 50,
  height: 45,
  origin: { col: 0, row: 27 },
  build(z) {
    z.fill('grass');

    // --- World border: darkness, with gaps for the three ways out -----------------------------------
    z.darkness({ col: -3, row: 24, w: 5, h: 51 }); // west
    z.darkness({ col: -3, row: 70, w: 56, h: 5 }); // south
    z.darkness({ col: -3, row: 27, w: 16, h: 3 }); // north, west of the overlook (its rim closes the rest)
    z.darkness({ col: 21, row: 27, w: 10, h: 3 }); // north, between the overlook and the gap
    z.darkness({ col: 37, row: 27, w: 16, h: 3 }); // north, east of the gap (and the corner)
    z.darkness({ col: 47, row: 34, w: 6, h: 38 }); // east, below the gap
    z.door(32, 27, 4, 'frostlands', 33, 24); // up to the Frostlands
    for (let row = 30; row <= 33; row++) z.door(49, row, 1, 'scorched', 2, row - 27); // across to the Scorched Waste

    // --- Groves, a beach lake, an old cobbled plaza -------------------------------------------------------------
    z.forest({ col: 22, row: 29, w: 9, h: 6 });
    z.forest({ col: 36, row: 31, w: 8, h: 5 });
    z.forest({ col: 4, row: 29, w: 8, h: 5 });
    z.forest({ col: 4, row: 58, w: 9, h: 6 });
    z.forest({ col: 16, row: 64, w: 12, h: 5 });
    z.forest({ col: 38, row: 61, w: 8, h: 7 });

    z.patch('sand', { col: 17, row: 50, w: 15, h: 11 }); // the beach
    z.patch('water', { col: 19, row: 52, w: 11, h: 7 });
    z.block({ col: 20, row: 53, w: 9, h: 5 }, 'lake');

    z.patch('stone', { col: 36, row: 44, w: 9, h: 7 }); // ruins
    z.prop('barrel', 38, 46);
    z.prop('barrel', 42, 49);
    z.prop('rockC', 41, 45);
    z.prop('rockB', 37, 49);

    z.prop('bush', 12, 40);
    z.prop('bush', 44, 54, { dx: 2 });
    z.prop('bush', 9, 54);
    z.prop('treeA', 9, 37);
    z.prop('treeB', 33, 57);
    z.prop('treeB', 45, 40);
    z.prop('treeA', 7, 41);
    for (const [col, row] of [
      [10, 44],
      [34, 54],
      [41, 56],
      [6, 51],
    ])
      z.prop('flowerRed', col, row);
    for (const [col, row] of [
      [27, 62],
      [8, 61],
    ])
      z.prop('flowersPurple', col, row);
    for (const [col, row] of [
      [48, 52],
      [12, 54],
      [34, 66],
    ])
      z.prop('rock', col, row);
    z.prop('rockC', 46, 37);

    z.prop('bush', 46, 47);
    z.prop('bush', 34, 52);
    z.prop('treeA', 5, 44);
    z.prop('treeB', 36, 58);
    z.prop('treeA', 48, 63);
    for (const [col, row] of [
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

    // --- The gate to the town: a grove with a gap, and a small cobbled plaza in front of it ---------------------
    z.forest({ col: 13, row: 36, w: 9, h: 3 });
    z.forest({ col: 25, row: 36, w: 11, h: 3 });
    z.patch('stone', { col: 19, row: 39, w: 9, h: 6 }); // fill is cols 20-26, rows 40-43
    z.prop('barrel', 20, 40);
    z.prop('barrel', 26, 40);
    z.door(GATE.door.col, GATE.door.row, GATE.door.w, 'town', 14, 16); // into the town, just above its south gate
    // The meadow where the village used to be.
    z.prop('treeA', 15, 44);
    z.prop('treeB', 30, 45);
    z.prop('bush', 14, 41);
    z.prop('bush', 32, 40);
    z.prop('bush', 28, 47);
    for (const [col, row] of [
      [16, 47],
      [24, 46],
      [31, 43],
      [20, 48],
    ])
      z.prop('flowerRed', col, row);
    for (const [col, row] of [
      [18, 42],
      [27, 49],
    ])
      z.prop('flowersPurple', col, row);
    z.prop('rock', 22, 47);

    z.spawn(8, 48);
    z.npc(12, 47);

    // Level 1 fodder (goblins, a wolfkin, the odd shade).
    for (const [kind, col, row] of [
      ['goblin', 18, 35],
      ['goblin', 40, 38],
      ['shade', 38, 54],
      ['wolfkin', 24, 62],
      ['shade', 44, 58],
      ['goblin', 15, 60],
    ] as const)
      z.mob(kind, col, row);

    // --- An overlook: raised ground with stairs up the south face -----------------------------------------------
    z.plateau({ col: 14, row: 28, w: 6, h: 5 }, { stairs: [16] });
    z.prop('rockSmall', 18, 29);
    z.prop('bush', 15, 31);
    for (const [col, row] of [
      [16, 29],
      [18, 31],
      [17, 30],
    ])
      z.prop(col === 17 ? 'flowersPurple' : 'flowerRed', col, row);
    z.mob('shade', 17, 31);

    // Treasure chests: the shops sell the common gear, so chests hold what they don't (a restorative, a bag, tools)
    // and purses of gold. A few coins by the start pay for a first purchase.
    z.chest('wood', 'coins', 10, 51);
    z.chest('wood', 'sack', 8, 52); // more pack slots, close to the start
    z.chest('wood', 'whetstone', 12, 49);
    z.chest('oak', 'elixir', 18, 30);
    z.chest('oak', 'purse', 16, 28);
    z.chest('oak', 'bandageKit', 15, 30);
  },
});
