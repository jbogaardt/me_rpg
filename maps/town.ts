import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, pond, road } from '../tools/map/helpers';
import { SHOP_ARRIVAL } from '../tools/map/interiors';
import layout from './world';

/**
 * The town's shops (world cells): the building's bottom-left cell, where its door cells are, and the cell just below it
 * where a player appears when they step back out (the shop interiors, maps/shop_*.ts, read this through `shopExit`).
 */
export const SHOP_DOORS = {
  smithy: { building: { col: 104, row: 138 }, door: { col: 106, w: 2 }, outside: { col: 106, row: 139 } },
  armory: { building: { col: 112, row: 138 }, door: { col: 113, w: 1 }, outside: { col: 113, row: 139 } },
  apothecary: { building: { col: 127, row: 138 }, door: { col: 129, w: 2 }, outside: { col: 129, row: 139 } },
  ranger: { building: { col: 135, row: 138 }, door: { col: 136, w: 1 }, outside: { col: 136, row: 139 } },
} as const;
export type ShopId = keyof typeof SHOP_DOORS;

const W = worldOf(layout);
/** Where the door out of shop `id` leads: the cell below its building's door, in the town's own cells. */
export const shopExit = (id: ShopId) => ({
  zone: 'town',
  ...W.toLocal('town', SHOP_DOORS[id].outside.col, SHOP_DOORS[id].outside.row),
});

const north = W.gap('town', 'greenwood', 0);
const west = W.gap('town', 'greenwood', 1);
const east = W.gap('town', 'frostlands');
/** Dirt streets from the three gates to the square, kept clear of props. */
const STREETS = [
  ...road([
    [north.col, north.row],
    [north.col, 140],
  ]), // the north road, from the Greenwood
  ...road([
    [west.col, west.row],
    [100, west.row],
    [100, 140],
  ]), // the west gate
  ...road([
    [124, 144],
    [124, east.row],
    [east.col, east.row],
  ]), // the east road, out to the Frostlands
];
const SQUARE = { col: 100, row: 139, w: 42, h: 8 }; // cobbled, with a grassy fringe

// The town: four shops along a cobbled square, dirt streets from its three gates (north and west into the Greenwood,
// east into the Frostlands), a pond and gardens. No enemies. Walk into a shop's door to go inside.
// World cells: cols 70-146, rows 119-160, stepped on the west (see maps/world.ts; `npm run map -- layout town`).
export default defineBiome({
  name: 'town',
  walls: { trees: TREES },
  build(z) {
    z.fill('grass');
    z.patch('stone', SQUARE);
    z.paint('dirt', STREETS);
    z.keepClear([...STREETS, SQUARE, { col: 102, row: 128, w: 38, h: 11 }]);
    const open = awayFrom([...STREETS, SQUARE]);

    for (const [id, shop] of Object.entries(SHOP_DOORS)) {
      z.prop(id as ShopId, shop.building.col, shop.building.row);
      z.door(shop.door.col, shop.building.row, shop.door.w, `shop_${id}`, SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    }
    z.spawn(118, 142);

    // --- Life in the square -----------------------------------------------------------------------------------
    for (const [col, row] of [
      [102, 141],
      [103, 144],
      [117, 140],
      [139, 144],
      [110, 144],
    ])
      z.prop('barrel', col, row);
    for (const [col, row] of [
      [108, 143],
      [132, 143],
      [126, 141],
    ])
      z.prop('flowersPurple', col, row);

    // --- A pond and gardens in the west of town ---------------------------------------------------------------
    const water = pond(z, { col: 80, row: 148, w: 10, h: 6 }, { shore: 'sand' });
    z.keepClear({ col: 78, row: 146, w: 14, h: 10 });
    z.prop('lilyFlower', water[2].col + 1, water[2].row);
    z.prop('lilyPads', water[3].col + 5, water[3].row);
    z.prop('reedsThin', water[5].col + 7, water[5].row);

    z.scatter(['treeA', 'treeB'], { count: 14, where: open, seed: 21 });
    z.scatter(['bush'], { count: 20, where: open, seed: 22 });
    z.scatter(['flowerRed', 'flowersPurple'], { count: 80, where: open, margin: 0, seed: 23 });
  },
});
