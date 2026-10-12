import { defineZone } from '../tools/map/zone';
import { trainingYard } from '../tools/map/training';

// The level 5 trial (Spark Volley, systems/skills.ts): orcs, skeletons and frostbound with a troll at the back. The enemies
// do not come back; beat them all and you learn the skill.
export default defineZone({
  name: 'training_apprentice',
  width: 24,
  height: 15,
  build(z) {
    trainingYard(z, [
      [6, 8],
      [17, 8],
      [11, 6],
      [12, 11],
    ]);
    z.mob('orc', 5, 4);
    z.mob('orc', 11, 3);
    z.mob('orc', 18, 4);
    z.mob('frostbound', 8, 6);
    z.mob('frostbound', 15, 6);
    z.mob('skeleton', 3, 3);
    z.mob('skeleton', 20, 3);
    z.mob('troll', 12, 4);
  },
});
