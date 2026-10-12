import { defineZone } from '../tools/map/zone';
import { SHOP_ROOM, shopInterior } from '../tools/map/interiors';
import { LECTERNS } from '../src/systems/lectern';
import { shopExit } from './town';

const LECTERN = LECTERNS.shop_wizard;

// Inside the wizard's sanctum (see tools/map/interiors.ts). The way back out leads to the cell below its door in the overworld.
export default defineZone({
  name: 'shop_wizard',
  ...SHOP_ROOM,
  build(z) {
    shopInterior(z, 'wizard', shopExit('wizard'));
    z.prop('lectern', LECTERN.col, LECTERN.row); // read the combos here (systems/lectern.ts)
  },
});
