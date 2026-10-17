import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';
import { shopExit } from './town';

// Inside the Resting Lantern (see tools/map/interiors.ts): the tavern where a party spends its breather. The way back
// out leads to the cell below its door in the market square.
export default defineZone({
  name: 'shop_tavern',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'tavern', shopExit('tavern'));
  },
});
