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
        ['ruinPillar', 4, 8], // LPC Jungle Ruins pillars and idols round the chest (ruins.png)
        ['ruinPillar', 4, 16],
        ['ruinStatue', 9, 16],
        ['ruinPillarBroken', 14, 8],
        ['ruinStatueB', 8, 14],
        ['ruinRubbleA', 11, 15],
      ],
      chest: ['iron', 'relic'],
      place: 'The Old Shrine',
    });
  },
});
