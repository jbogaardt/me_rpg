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
    z.mob('chieftain', 6, 4);
    z.mob('chieftain', 12, 3);
    z.mob('chieftain', 19, 4);
    z.mob('cultist', 3, 3);
    z.mob('cultist', 22, 3);
    z.mob('cultist', 14, 8);
    z.mob('troll', 9, 6);
    z.mob('troll', 16, 6);
  },
});
