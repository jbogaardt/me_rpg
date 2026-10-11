import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';
import { SHOP_DOORS } from './overworld';

// Inside the armory (see tools/map/interiors.ts). The way back out leads to the cell below its door in the overworld.
export default defineZone({
  name: 'shop_armory',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'armory', { zone: 'overworld', ...SHOP_DOORS.armory.outside });
  },
});
