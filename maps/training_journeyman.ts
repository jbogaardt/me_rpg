import { defineZone } from '../tools/map/zone';
import { trainingYard } from '../tools/map/training';

// The level 10 trial (Iron Skin, systems/skills.ts): orc chieftains and cultists, who hit hard enough to matter at that
// level. The enemies do not come back; beat them all and you learn the skill.
export default defineZone({
  name: 'training_journeyman',
  width: 26,
  height: 16,
  build(z) {
    trainingYard(z, [
      [6, 9],
      [19, 9],
      [12, 7],
      [13, 12],
      [7, 12],
    ]);
  },
});
