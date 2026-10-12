import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
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
  wizard: { building: { col: 170, row: ROW }, door: { col: 172, w: 2 }, outside: { col: 172, row: ROW + 1 } },
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

// The town: five shops along a market square, trails from its three gates (north and west into the Greenwood, east
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

    // --- Warden Maren: keeper of the town lamp, and the one who hands out the story quests (systems/quests.ts) -------------
    z.giver('maren', ...z.near(...at(16.9, 20.3)));

    // --- A pond and gardens in the west of town ---------------------------------------------------------------
    const water = pond(z, area(11.6, 20.6, 1.6, 1), { shore: 'sand' });
    z.keepClear(area(11.3, 20.3, 2.2, 1.6));
    z.prop('lilyFlower', pick(water, 3).col + 2, pick(water, 3).row);
    z.prop('lilyPads', pick(water, 5).col + 8, pick(water, 5).row);
    reedsAt(z, water, 8, 'e', 'reedStalks');
    z.paint('meadow', blob(area(15, 21.4, 4, 1.2)));
    for (const [x, y, w, h] of [
      [12.4, 18.8, 1.4, 1],
      [19, 18.2, 1.2, 1.2],
      [10.6, 22, 1.6, 0.8],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: TREES });

    z.scatter([...TREES], { count: 24, where: open, seed: 21 });
    z.scatter(['bush'], { count: 16, where: open, seed: 22 });
    z.scatter(['flowerRed', 'flowersPurple'], { count: 150, where: open, margin: 0, seed: 23 });

    // --- Strays: talk to them with the action key (a dog woofs, a cat meows) ----------------------------------
    z.pet('dog_brown', ...z.near(...at(15.9, 20.7)));
    z.pet('dog_white', ...z.near(...at(19.2, 19.9)));
    z.pet('cat_ginger', ...z.near(...at(13.7, 20.3)));
    z.pet('cat_black', ...z.near(...at(17.9, 20.6)));
    z.pet('rat', ...z.near(...at(14.9, 20.9))); // by the barrels
    z.pet('dog_tan', ...z.near(...at(12.4, 19.4)));
    z.pet('dog_black', ...z.near(...at(18.6, 21.3)));
    z.pet('cat_white', ...z.near(...at(16.7, 20.6)));
    z.pet('cat_tan', ...z.near(...at(15.2, 21.6)));
    z.pet('rat', ...z.near(...at(19.6, 20.6)));

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place('Market Square', 168, 206);
    z.place('The Lanternrest Pond', 116, 206);
  },
});
