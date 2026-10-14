import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { DEAD_END, deadEnd } from '../tools/map/deadEnd';

// A dead end of the Emberfall pack: a cove of ash and a lava pool, reached from the south. Fire.
export default defineZone({
  name: 'end_ember_cove',
  width: DEAD_END.W,
  height: DEAD_END.H,
  build(z) {
    deadEnd(z, {
      climate: 'undead',
      fill: 'grass',
      ground: 'ash',
      path: 'mud',
      trees: [...DEAD_TREES],
      fillers: ['deadBush', 'darkSpire'],
      side: 'south',
      water: 'lava',
      ice: false,
      props: [
        ['darkBoulder', 8, 8],
        ['darkSpire', 22, 14],
        ['deadTreeB', 6, 15],
      ],
      chest: ['iron', 'hoard'],
      place: 'The Ember Cove',
    });
  },
});
