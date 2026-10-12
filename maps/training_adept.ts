import { defineZone } from '../tools/map/zone';
import { trainingYard } from '../tools/map/training';

// The second trial (Spirit Mark, level 15; systems/skills.ts): a bigger yard held by warlords and wraiths, who hit hard
// enough to matter to a hero of that level. The enemies do not come back; beat them all and you learn the skill.
export default defineZone({
  name: 'training_adept',
  width: 28,
  height: 17,
  build(z) {
    trainingYard(z, [
      [6, 9],
      [20, 9],
      [13, 7],
      [14, 12],
      [8, 13],
      [19, 13],
    ]);
    z.mob('warlord', 6, 4);
    z.mob('warlord', 13, 3);
    z.mob('warlord', 21, 4);
    z.mob('wraith', 3, 3);
    z.mob('wraith', 24, 3);
    z.mob('wraith', 13, 8);
  },
});
