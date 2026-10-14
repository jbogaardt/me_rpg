import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { blob, pond, trail } from '../tools/map/helpers';

// Campaign 2: the Ember Caldera, the island's burning heart. A ring of ash round a lake of lava, the Obsidian Warden's
// ground on the far rim, and the way back down to the Cinder Coast (maps/emberfall_coast.ts) in the south.
const W = 50;
const H = 38;
const TREES = [...DEAD_TREES];
/** What closes a port nothing leads through. */
const SEAL = ['deadBush', 'darkBoulder', 'deadBush'] as const;

export default defineZone({
  name: 'emberfall_caldera',
  width: W,
  height: H,
  build(z) {
    z.climate('undead');
    z.fill('grass');
    z.paint('ash', { col: -2, row: -2, w: W + 4, h: H + 4 });
    z.paint('mud', [
      ...trail([
        [24, 35],
        [24, 27],
        [10, 27],
        [10, 6],
        [24, 6],
      ]),
      ...trail([
        [24, 27],
        [38, 27],
        [38, 6],
        [24, 6],
      ]),
    ]);
    z.paint(
      'mud',
      trail([
        [38, 20],
        [48, 20],
      ]),
    );
    z.paint('soot', blob({ col: 19, row: 2, w: 12, h: 7 })); // the Warden's ground

    z.forest({ col: -3, row: -3, w: W + 6, h: 5 }, { trees: TREES, seed: 11 });
    z.forest({ col: -3, row: H - 4, w: 26, h: 7 }, { trees: TREES, seed: 12 });
    z.forest({ col: 28, row: H - 4, w: W - 25, h: 7 }, { trees: TREES, seed: 13 });
    z.forest({ col: -3, row: 2, w: 6, h: H - 6 }, { trees: TREES, seed: 14 });
    z.forest({ col: W - 3, row: 2, w: 6, h: 16 }, { trees: TREES, seed: 15 });
    z.forest({ col: W - 3, row: 23, w: 6, h: H - 27 }, { trees: TREES, seed: 16 });
    z.port('south', 24, 36, 3, 25, 32, 1, [...SEAL]);
    z.port('east', W - 1, 19, 1, W - 4, 20, 3, [...SEAL]); // where it leads is the content's (biomes.json ports)

    // The lava lake, and smaller vents round it.
    pond(z, { col: 17, row: 12, w: 16, h: 9 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 6, row: 30, w: 4, h: 2 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 40, row: 30, w: 4, h: 3 }, { water: 'lava', shore: 'mud' });

    for (const [col, row, w, h] of [
      [3, 2, 7, 6],
      [40, 2, 7, 6],
      [3, 31, 3, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: ['deadBush', 'darkSpire'], density: 0.9, fill: true });
    for (const [name, col, row] of [
      ['darkBoulder', 14, 28],
      ['darkBoulderB', 34, 28],
      ['darkSpire', 8, 17],
      ['darkSpire', 42, 16],
      ['darkBoulder', 16, 6],
      ['darkBoulderB', 31, 6],
    ] as const)
      z.prop(name, col, row);

    z.spawn(25, 32);
    z.chest('iron', 'hoard', 25, 3);
    z.chest('iron', 'elixir', 27, 3);
    z.place('The Molten Heart', 25, 16);
    z.place("The Warden's Rim", 25, 5);
  },
});
