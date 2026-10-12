import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, trail, units } from '../tools/map/helpers';
import { SHOP_ARRIVAL } from '../tools/map/interiors';
import layout from './world';

const W = worldOf(layout);
const { at, area } = units(layout.square);
const ROW = 200; // the shops stand along this row (their bottom), facing the market

/**
 * The town's shops (world cells): the building's bottom-left cell, where its door cells are, and the cell just below it
 * where a player appears when they step back out (the shop interiors, maps/shop_*.ts, read this through `shopExit`).
 */
export const SHOP_DOORS = {
  smithy: { building: { col: 148, row: ROW }, door: { col: 150, w: 2 }, outside: { col: 150, row: ROW + 1 } },
  armory: { building: { col: 156, row: ROW }, door: { col: 157, w: 1 }, outside: { col: 157, row: ROW + 1 } },
  apothecary: { building: { col: 162, row: ROW }, door: { col: 164, w: 2 }, outside: { col: 164, row: ROW + 1 } },
  ranger: { building: { col: 178, row: ROW }, door: { col: 179, w: 1 }, outside: { col: 179, row: ROW + 1 } },
} as const;
export type ShopId = keyof typeof SHOP_DOORS;

/** Where the door out of shop `id` leads: the cell below its building's door, in the town's own cells. */
export const shopExit = (id: ShopId) => ({
  zone: 'town',
  ...W.toLocal('town', SHOP_DOORS[id].outside.col, SHOP_DOORS[id].outside.row),
});

const gap = (to: string, n = 0): [number, number] => {
  const g = W.gap('town', to, n);
  return [g.col, g.row];
};
const [north, west, east] = [gap('greenwood', 0), gap('greenwood', 1), gap('frostlands')];
const MARKET = area(14.2, 20.1, 5.2, 1.2); // the open ground in front of the shops
const STREETS = [
  ...trail([north, [north[0], ROW + 2]]), // the north road, from the Greenwood
  ...trail([west, [140, west[1]], [140, ROW + 3]]), // the west gate
  ...trail([[186, ROW + 6], [186, east[1]], east]), // the east road, out to the Frostlands
];

// The town: four shops along a market square, trails from its three gates (north and west into the Greenwood, east
// into the Frostlands), a pond and gardens. No enemies. Walk into a shop's door to go inside.
// Squares x 10-20, y 17-22 of maps/world.ts (`npm run map -- layout town`).
export default defineBiome({
  name: 'town',
  climate: 'temperate',
  walls: { trees: TREES },
  build(z) {
    z.fill('grass');
    z.paint('dirt', [...STREETS, ...blob(MARKET, 5, 0.25)]);
    z.keepClear([...STREETS, MARKET, { col: 146, row: 190, w: 36, h: 11 }]);
    const open = awayFrom([...STREETS, MARKET]);

    for (const [id, shop] of Object.entries(SHOP_DOORS)) {
      z.prop(id as ShopId, shop.building.col, shop.building.row);
      z.door(shop.door.col, shop.building.row, shop.door.w, `shop_${id}`, SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    }
    z.spawn(...z.near(168, 205));

    // --- Life in the market ----------------------------------------------------------------------------------
    for (const [x, y] of [
      [14.6, 20.4],
      [14.8, 20.8],
      [17.2, 20.3],
      [18.6, 20.9],
      [16.0, 21.0],
    ] as const)
      z.prop('barrel', ...z.near(...at(x, y)));

    // --- A pond and gardens in the west of town ---------------------------------------------------------------
    const water = pond(z, area(11.6, 20.6, 1.6, 1), { shore: 'sand' });
    z.keepClear(area(11.3, 20.3, 2.2, 1.6));
    z.prop('lilyFlower', pick(water, 3).col + 2, pick(water, 3).row);
    z.prop('lilyPads', pick(water, 5).col + 8, pick(water, 5).row);
    z.prop('reedsThin', pick(water, 8).col + 3, pick(water, 8).row);
    z.paint('meadow', blob(area(15, 21.4, 4, 1.2)));
    for (const [x, y, w, h] of [
      [12.4, 18.8, 1.4, 1],
      [19, 18.2, 1.2, 1.2],
      [10.6, 22, 1.6, 0.8],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: TREES });

    z.scatter(['treeA', 'treeB'], { count: 24, where: open, seed: 21 });
    z.scatter(['bush'], { count: 40, where: open, seed: 22 });
    z.scatter(['flowerRed', 'flowersPurple'], { count: 150, where: open, margin: 0, seed: 23 });
  },
});
