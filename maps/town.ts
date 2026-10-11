import { defineZone } from '../tools/map/zone';
import { SHOP_ARRIVAL } from '../tools/map/interiors';

/**
 * The town's shops: the building's bottom-left cell, where its door cells are, and the cell just below it where a player
 * appears when they step back out (the shop interiors, maps/shop_*.ts, read this).
 */
export const SHOP_DOORS = {
  smithy: { building: { col: 4, row: 9 }, door: { col: 6, w: 2 }, outside: { col: 6, row: 10 } },
  armory: { building: { col: 11, row: 9 }, door: { col: 12, w: 1 }, outside: { col: 12, row: 10 } },
  apothecary: { building: { col: 15, row: 9 }, door: { col: 17, w: 2 }, outside: { col: 17, row: 10 } },
  ranger: { building: { col: 22, row: 9 }, door: { col: 23, w: 1 }, outside: { col: 23, row: 10 } },
} as const;

// The town: four shops in a row on a cobbled square; walk into a door to go inside. No enemies. You come in from the
// Greenwood's gate at the south; the gap in the trees below the square (cols 13-16) leads back out.
//
// Build with `npm run map -- build`; preview in maps/out/town.png.
export default defineZone({
  name: 'town',
  width: 30,
  height: 20,
  build(z) {
    z.fill('grass');
    z.patch('stone', { col: 3, row: 9, w: 23, h: 5 });
    for (const [id, shop] of Object.entries(SHOP_DOORS)) {
      z.prop(id as 'smithy' | 'armory' | 'apothecary' | 'ranger', shop.building.col, shop.building.row);
      z.door(shop.door.col, shop.building.row, shop.door.w, `shop_${id}`, SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
    }

    // --- Border trees, with a gap in the south that leads out to the Greenwood --------------------------------
    z.forest({ col: -3, row: -3, w: 36, h: 4 }); // north (the shops stand in front of it)
    z.forest({ col: -3, row: -3, w: 6, h: 26 }); // west
    z.forest({ col: 27, row: -3, w: 6, h: 26 }); // east
    z.forest({ col: -3, row: 17, w: 16, h: 6 }); // south, west of the gap
    z.forest({ col: 17, row: 17, w: 16, h: 6 }); // south, east of the gap
    z.door(13, 19, 4, 'greenwood', 23, 14); // out to the Greenwood, just below its gate

    // --- Life in the square -------------------------------------------------------------------------------------
    z.prop('barrel', 8, 13);
    z.prop('barrel', 26, 15);
    z.prop('bush', 8, 16);
    z.prop('bush', 21, 16);
    z.prop('treeA', 4, 17);
    z.prop('treeB', 24, 17);
    for (const [col, row] of [
      [9, 15],
      [12, 16],
      [18, 15],
      [22, 16],
    ])
      z.prop('flowerRed', col, row);
    for (const [col, row] of [
      [7, 14],
      [20, 14],
    ])
      z.prop('flowersPurple', col, row);

    z.spawn(14, 15);
  },
});
