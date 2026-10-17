import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { DEAD_END, deadEnd } from '../tools/map/deadEnd';

// A dead end of the Wilds pack: a ring of standing stones by a chasm, reached from the east. Undead.
export default defineZone({
  name: 'end_old_shrine',
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
      side: 'east',
      water: 'abyss',
      ice: false,
      props: [
        ['menhir', 4, 8],
        ['menhir', 4, 16],
        ['menhir', 9, 16],
        ['menhir', 14, 8],
        // Old burial markers among the ring.
        ['graveBoulder', 9, 8],
        ['crossBlack', 12, 16],
        ['crossIronTall', 7, 16],
        ['crossIronB', 2, 12],
      ],
      chest: ['iron', 'relic'],
      place: 'The Old Shrine',
    });
  },
});
