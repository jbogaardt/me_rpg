import { defineZone } from '../tools/map/zone';
import { SWAMP_TREES } from '../tools/map/catalog';
import { DEAD_END, deadEnd } from '../tools/map/deadEnd';

// A dead end of the Wilds pack: a sunken hollow of murk, reached from the west. Swamp.
export default defineZone({
  name: 'end_bog_hollow',
  width: DEAD_END.W,
  height: DEAD_END.H,
  build(z) {
    deadEnd(z, {
      climate: 'swamp',
      fill: 'grass',

      path: 'mud',
      trees: [...SWAMP_TREES],
      fillers: ['swampBush', 'rockSmall'],
      side: 'west',
      water: 'murk',
      ice: false,
      props: [
        ['swampTreeA', 10, 6],
        ['rockSmall', 12, 16],
        ['swampBush', 20, 16],
      ],
      chest: ['wood', 'elixir'],
      place: 'The Bog Hollow',
    });
  },
});
