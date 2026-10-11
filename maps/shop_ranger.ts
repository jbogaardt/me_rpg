import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';
import { SHOP_DOORS } from './town';

// Inside the ranger (see tools/map/interiors.ts). The way back out leads to the cell below its door in the overworld.
export default defineZone({
  name: 'shop_ranger',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'ranger', { zone: 'town', ...SHOP_DOORS.ranger.outside });
  },
});
