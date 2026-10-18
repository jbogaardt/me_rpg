// The inside of a shop: one small room per shop, built the same way for all four. The zone spec in maps/shop_<id>.ts
// says where the door leads back to (the cell below the building's door in the overworld).

import type { PrefabName } from './catalog';
import type { ZoneApi } from './zone';

export const SHOP_ROOM = { width: 11, height: 9 } as const;

/** The cell inside the room where a player arrives (just above the doormat). */
export const SHOP_ARRIVAL = { col: 4, row: 7 } as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Fill `z` (11x9 cells) with a shop: wall and shelves along the back, the keeper behind a counter, a doormat at the
 * front. `out` is where the door leads back to in the overworld; `look` is whose sign and shelves it has (smithy,
 * armory, ranger or apothecary), the shop's own id by default.
 */
export function shopInterior(
  z: ZoneApi,
  id: string,
  out: { zone: string; col: number; row: number },
  look: string = id,
) {
  z.indoor();
  z.fill('planks');
  z.fill('wall', { col: 0, row: 0, w: SHOP_ROOM.width, h: 2 });
  z.block({ col: 0, row: 0, w: SHOP_ROOM.width, h: 2 }, 'back wall');

  z.prop('shopWindow', 0, 1);
  z.prop('shopWindow', 10, 1);
  z.prop(`sign${cap(look)}` as PrefabName, 3, 1);
  // Shelves stand against the wall: their foot is on the floor line just below it and their face covers the wall.
  z.prop(`shelf${cap(look)}` as PrefabName, 1, 1, { dy: 8 });
  z.prop(`shelf${cap(look)}` as PrefabName, 7, 1, { dy: 8 });
  z.prop('counter', 3, 5);
  z.prop('barrel', 1, 7);
  z.prop('barrel', 9, 7);

  z.fill('mat', { col: 4, row: 8, w: 2, h: 1 });
  z.door(4, 8, 2, out.zone, out.col, out.row);
  z.spawn(SHOP_ARRIVAL.col, SHOP_ARRIVAL.row);
  z.shop(id, 4, 4); // behind the counter
}
