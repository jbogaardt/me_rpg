import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';

// Inside the armory of Hearthmere (maps/haven_town.ts; a room of the towns pack's region, see tools/map/interiors.ts). The way
// back out leads to the cell below its door in the town.
export default defineZone({
  name: 'haven_armory',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'hearth_armory', { zone: 'haven_town', col: 13, row: 35 }, 'armory');
  },
});
