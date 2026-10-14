import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { blob, pond, trail } from '../tools/map/helpers';

// Campaign 2 (public/content/campaign2/): Emberfall Isle. The Cinder Coast is where the hero washes up: ash fields walled
// by dead woods, smoking lava pools in the east, a glassy chasm in the west, and Keeper Ysolde's camp at the landing in
// the south. A trail climbs north (in campaign 2 to the caldera, maps/emberfall_caldera.ts) and one runs south to the
// woods' edge: ports, so a random campaign can join the coast to any region. Its enemies are the content's.
const W = 72;
const H = 52;
const TREES = [...DEAD_TREES];
const FILLERS = ['deadBush', 'darkSpire'] as const;

export default defineZone({
  name: 'emberfall_coast',
  width: W,
  height: H,
  build(z) {
    z.climate('undead');
    z.fill('grass');
    z.paint('ash', { col: -2, row: -2, w: W + 4, h: H + 4 });

    // --- Trails: the landing up to the caldera door, and a branch each way --------------------------------------
    const north = trail([
      [34, 42],
      [34, 2],
    ]);
    const west = trail([
      [34, 28],
      [12, 28],
    ]);
    const east = trail([
      [34, 24],
      [56, 24],
    ]);
    const south = trail([
      [16, 28],
      [16, 50],
    ]);
    z.paint('mud', [...north, ...west, ...east, ...south]);
    z.paint('soot', blob({ col: 29, row: 36, w: 13, h: 9 })); // the trodden ground of the camp

    // --- The woods round the island, with the way north open ------------------------------------------------------
    z.forest({ col: -3, row: -3, w: 36, h: 7 }, { trees: TREES, seed: 1 });
    z.forest({ col: 38, row: -3, w: W - 35, h: 7 }, { trees: TREES, seed: 2 });
    z.forest({ col: -3, row: H - 4, w: 17, h: 7 }, { trees: TREES, seed: 3 });
    z.forest({ col: 19, row: H - 4, w: W - 16, h: 7 }, { trees: TREES, seed: 6 });
    z.forest({ col: -3, row: 4, w: 7, h: H - 8 }, { trees: TREES, seed: 4 });
    z.forest({ col: W - 4, row: 4, w: 7, h: H - 8 }, { trees: TREES, seed: 5 });
    // Where the ports lead is the content's (biomes.json `ports`); one nothing binds is walled up.
    z.port('north', 34, 1, 3, 35, 4);
    z.port('south', 15, H - 2, 3, 16, H - 6);

    // --- Lava pools in the east, a chasm of glass in the west ------------------------------------------------------
    pond(z, { col: 52, row: 13, w: 7, h: 4 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 57, row: 31, w: 5, h: 3 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 9, row: 17, w: 6, h: 3 }, { water: 'abyss' });
    pond(z, { col: 18, row: 38, w: 4, h: 3 }, { water: 'pit' });

    // --- Groves of dead trees ---------------------------------------------------------------------------------------
    for (const [col, row, w, h] of [
      [6, 5, 12, 8],
      [42, 4, 10, 7],
      [5, 33, 9, 9],
      [46, 37, 12, 8],
      [22, 13, 8, 6],
      [59, 17, 7, 9],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: [...FILLERS], density: 0.9, fill: true });
    for (const [name, col, row] of [
      ['deadTreeA', 27, 9],
      ['deadTreeC', 18, 23],
      ['deadTreeB', 44, 31],
      ['deadTreeD', 25, 44],
      ['deadTreeE', 63, 29],
    ] as const)
      z.prop(name, col, row);

    // --- Rocks ------------------------------------------------------------------------------------------------------
    for (const [name, col, row] of [
      ['darkBoulder', 14, 24],
      ['darkBoulderB', 26, 32],
      ['darkSpire', 41, 18],
      ['darkSpire', 19, 13],
      ['darkBoulder', 50, 30],
      ['darkBoulderB', 62, 44],
      ['darkSpire', 9, 44],
      ['deadBush', 40, 33],
      ['deadBush', 28, 22],
      ['darkBoulder', 54, 21],
      ['darkSpire', 30, 10],
    ] as const)
      z.prop(name, col, row);

    // --- Ysolde's camp at the landing -------------------------------------------------------------------------------
    z.spawn(35, 41);
    z.giver('keeper', 32, 39); // the campaign's keeper (quests.json `givers.keeper`)
    z.chest('wood', 'potion', 39, 38);
    z.chest('wood', 'bandageKit', 40, 38);
    z.sign(37, 32, { up: 'The North Trail', left: 'The Glass Fields', right: 'The Smoking Pools' });
    z.place('The North Trail', 35, 7);
    z.place('The Landing', 35, 42);
    z.place('The Glass Fields', 14, 26);
    z.place('The Smoking Pools', 55, 18);

    // --- Emberblooms for Ysolde's second task ------------------------------------------------------------------------
    for (const [col, row] of [
      [13, 29],
      [21, 11],
      [47, 21],
      [60, 39],
    ] as const)
      z.site('emberbloom', col, row);
  },
});
