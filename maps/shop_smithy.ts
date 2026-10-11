import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';
import { shopExit } from './town';

// Inside the smithy (see tools/map/interiors.ts). The way back out leads to the cell below its door in the overworld.
export default defineZone({
  name: 'shop_smithy',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'smithy', shopExit('smithy'));
  },
});
