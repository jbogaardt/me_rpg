import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';
import { SHOP_DOORS } from './overworld';

// Inside the apothecary (see tools/map/interiors.ts). The way back out leads to the cell below its door in the overworld.
export default defineZone({
  name: 'shop_apothecary',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'apothecary', { zone: 'overworld', ...SHOP_DOORS.apothecary.outside });
  },
});
