import { defineZone } from '../tools/map/zone';
import { FROST_TREES } from '../tools/map/catalog';
import { DEAD_END, deadEnd } from '../tools/map/deadEnd';

// A dead end of the Wilds pack: a frozen grotto, reached from the north. Frost.
export default defineZone({
  name: 'end_frost_grotto',
  width: DEAD_END.W,
  height: DEAD_END.H,
  build(z) {
    deadEnd(z, {
      climate: 'frost',
      fill: 'snow',
      ground: 'snow',
      path: 'dirt',
      trees: [...FROST_TREES],
      fillers: ['frostBush', 'frostRockSmall'],
      side: 'north',

      ice: true,
      props: [
        ['frostRock', 8, 8],
        ['frostRockB', 22, 6],
        ['frostTreeB', 7, 15],
      ],
      chest: ['oak', 'purse'],
      place: 'The Frost Grotto',
    });
  },
});
