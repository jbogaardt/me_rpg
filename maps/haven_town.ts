import { defineZone } from '../tools/map/zone';
import { TREES } from '../tools/map/catalog';
import { blob, pond, reedsAt, trail } from '../tools/map/helpers';
import { SHOP_ARRIVAL } from '../tools/map/interiors';

// A region for random and live worlds (public/content/packs/towns.json): Hearthmere, a market town round a cobbled
// square, a safe harbour beside the land a story starts in. No foes live here (the pack gives it none): it is where a
// party rests, talks to townsfolk and takes stock between sagas. Barrels to carry and named places make the DM's quests
// of errands (haul, visit) possible without a fight. A port on each edge joins it to whichever region it stands beside.
const W = 52;
const H = 40;
/** What closes a port nothing leads through. */
const SEAL = ['bush'] as const;
const FILLERS = ['bush', 'rockSmall'] as const;
const SQUARE = { col: 18, row: 15, w: 16, h: 11 };

export default defineZone({
  name: 'haven_town',
  width: W,
  height: H,
  build(z) {
    z.climate('temperate');
    z.fill('grass');

    // --- The square, and the four roads out of it -------------------------------------------------------------------
    z.patch('stone', SQUARE);
    const roads = [
      ...trail([
        [25, 2],
        [25, SQUARE.row],
      ]),
      ...trail([
        [25, SQUARE.row + SQUARE.h - 1],
        [25, 38],
      ]),
      ...trail([
        [1, 20],
        [SQUARE.col, 20],
      ]),
      ...trail([
        [SQUARE.col + SQUARE.w - 1, 20],
        [50, 20],
      ]),
    ];
    z.paint('dirt', roads);

    // --- Woods all round, open at the four gates --------------------------------------------------------------------
    z.forest({ col: -3, row: -3, w: 27, h: 6 }, { trees: TREES, seed: 1 });
    z.forest({ col: 27, row: -3, w: W - 24, h: 6 }, { trees: TREES, seed: 2 });
    z.forest({ col: -3, row: H - 3, w: 27, h: 6 }, { trees: TREES, seed: 3 });
    z.forest({ col: 27, row: H - 3, w: W - 24, h: 6 }, { trees: TREES, seed: 4 });
    z.forest({ col: -3, row: 3, w: 5, h: 16 }, { trees: TREES, seed: 5 });
    z.forest({ col: -3, row: 22, w: 5, h: H - 25 }, { trees: TREES, seed: 6 });
    z.forest({ col: W - 2, row: 3, w: 5, h: 16 }, { trees: TREES, seed: 7 });
    z.forest({ col: W - 2, row: 22, w: 5, h: H - 25 }, { trees: TREES, seed: 8 });
    // Where the gates lead is the content's (a pack region's `ports`); one nothing binds is walled up.
    z.port('north', 24, 1, 3, 25, 4, 1, [...SEAL]);
    z.port('west', 0, 19, 1, 3, 20, 3, [...SEAL]);
    z.port('east', W - 1, 19, 1, W - 4, 20, 3, [...SEAL]);
    z.port('south', 24, H - 2, 3, 25, H - 6, 1, [...SEAL]);

    // --- The town's halls, round the square (scenery: solid, you walk round them) --------------------------------------
    // Each hall is a shop: its door leads into a room (maps/haven_*.ts, the region's `rooms` in the towns pack).
    z.prop('smithy', 10, 13);
    z.door(12, 13, 1, 'haven_forge', SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    z.prop('apothecary', 36, 13);
    z.door(38, 13, 1, 'haven_goods', SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    z.prop('armory', 12, 34);
    z.door(13, 34, 1, 'haven_armory', SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    z.prop('ranger', 38, 34);
    z.door(39, 34, 1, 'haven_lodge', SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    // Hanging signs (OpenGameArt) on the wall beside each hall's door, showing what it sells.
    z.prop('hangTools', 13, 13, { dy: -6 });
    z.prop('hangFlask', 39, 13, { dy: -6 });
    z.prop('hangPot', 37, 13, { dy: -6 }); // the goods hall sells a little of everything
    z.prop('hangHelm', 14, 34, { dy: -6 });
    z.prop('hangInn', 40, 34, { dy: -6 }); // the Gatehouse Lodge is the town's inn
    z.prop('hangMug', 38, 34, { dy: -6 });
    z.prop('noticeBoardB', 22, 17); // the town's notice board, on the square (a quest giver's wall)

    // --- Barrels by the smithy and the market, for the townsfolk's errands -------------------------------------------
    for (const [col, row] of [
      [17, 12],
      [8, 15],
      [15, 16],
      [20, 27],
      [31, 27],
      [35, 16],
      [43, 15],
    ] as const)
      z.prop('barrel', col, row);

    // --- The mill pond in the south-west, and gardens --------------------------------------------------------------
    const water = pond(z, { col: 4, row: 25, w: 7, h: 5 }, { shore: 'sand' });
    const mid = water[Math.floor(water.length / 2)];
    if (mid) z.prop('lilyPads', mid.col + 1, mid.row);
    reedsAt(z, water, 1, 'e', 'reedStalks');
    for (const [col, row, w, h] of [
      [42, 5, 6, 5],
      [4, 5, 5, 4],
      [30, 31, 5, 4],
      [43, 25, 5, 5],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: [...FILLERS], density: 0.8, fill: true });
    for (const [name, col, row] of [
      ['flowerRed', 19, 13],
      ['flowersPurple', 31, 13],
      ['flowerRed', 22, 28],
      ['flowersPurple', 28, 29],
      ['bush', 33, 9],
      ['bush', 16, 30],
    ] as const)
      z.prop(name, col, row);

    // --- A small churchyard in the north, off the road: headstones in two rows, old crosses at the ends ---------
    for (const [name, col, row] of [
      ['graveRoundA', 31, 4],
      ['graveCrossA', 33, 4],
      ['graveWideA', 35, 4],
      ['crossWood', 30, 6],
      ['graveRoundB', 32, 6],
      ['graveSmall', 34, 6],
      ['crossMound', 36, 6],
    ] as const)
      z.prop(name, col, row);

    // --- Life in town ---------------------------------------------------------------------------------------------
    z.spawn(26, 21);
    z.sign(28, 17, { up: 'The North Gate', left: 'The West Gate', down: 'The South Gate', right: 'The East Gate' });
    z.pet('dog_brown', 22, 22);
    z.pet('cat_ginger', 14, 17);
    z.pet('cat_black', 33, 23);

    // --- Names for the map, and for the DM's errands ---------------------------------------------------------------
    z.place('The Market Square', 25, 20);
    z.place('The Smithy Yard', 13, 15);
    z.place('The Mill Pond', 8, 27);
    z.place('The North Gate', 25, 5);
    z.place('The South Gate', 25, 34);
    z.place('The West Gate', 5, 20);
    z.place('The East Gate', 46, 20);
  },
});
