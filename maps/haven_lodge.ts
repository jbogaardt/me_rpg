import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';

// Inside the lodge of Hearthmere (maps/haven_town.ts; a room of the towns pack's region, see tools/map/interiors.ts). The way
// back out leads to the cell below its door in the town.
export default defineZone({
  name: 'haven_lodge',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'hearth_lodge', { zone: 'haven_town', col: 39, row: 35 }, 'ranger');
  },
});
