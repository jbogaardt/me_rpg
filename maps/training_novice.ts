import { defineZone } from '../tools/map/zone';
import { trainingYard } from '../tools/map/training';

// The first trial (Arcane Edge, systems/skills.ts): a stone yard with a wave of goblins, wolfkin and shades up the far end.
// The enemies do not come back; beat them all and you learn the skill. The player arrives at the bottom, by the way out.
export default defineZone({
  name: 'training_novice',
  width: 22,
  height: 15,
  build(z) {
    trainingYard(z, [
      [5, 8],
      [16, 8],
      [10, 6],
      [11, 11],
    ]);
  },
});
