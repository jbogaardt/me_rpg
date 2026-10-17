import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { blob, pond, trail } from '../tools/map/helpers';

// A region for random and live worlds (public/content/packs/heartlands.json): the Mistmoor, a drowned heath of black
// pools and dead trees round a sunken chapel. The restless dead and bog things walk it (the pack says which). A port on
// each edge joins it to whichever region the world puts beside it.
const W = 52;
const H = 40;
/** What closes a port nothing leads through. */
const SEAL = ['deadBush'] as const;
const FILLERS = ['deadBush', 'deadBushSmall', 'rockSmall'] as const;

export default defineZone({
  name: 'heart_mistmoor',
  width: W,
  height: H,
  build(z) {
    z.climate('swamp');
    z.fill('grass');
    z.paint('mud', [{ col: -2, row: -2, w: W + 4, h: H + 4 }]); // the whole moor is wet ground

    // --- Causeways: raised paths between the pools ---------------------------------------------------------------------
    const ways = [
      ...trail([
        [25, 2],
        [25, 14],
        [20, 14],
        [20, 30],
        [25, 30],
        [25, 38],
      ]),
      ...trail([
        [1, 20],
        [12, 20],
        [12, 17],
        [50, 17],
      ]),
    ];
    z.paint('dirt', ways);

    // --- Dead wood all round, open at the four ports ------------------------------------------------------------------
    z.forest({ col: -3, row: -3, w: 27, h: 6 }, { trees: DEAD_TREES, seed: 21 });
    z.forest({ col: 27, row: -3, w: W - 24, h: 6 }, { trees: DEAD_TREES, seed: 22 });
    z.forest({ col: -3, row: H - 3, w: 27, h: 6 }, { trees: DEAD_TREES, seed: 23 });
    z.forest({ col: 27, row: H - 3, w: W - 24, h: 6 }, { trees: DEAD_TREES, seed: 24 });
    z.forest({ col: -3, row: 3, w: 5, h: 16 }, { trees: DEAD_TREES, seed: 25 });
    z.forest({ col: -3, row: 22, w: 5, h: H - 25 }, { trees: DEAD_TREES, seed: 26 });
    z.forest({ col: W - 2, row: 3, w: 5, h: 13 }, { trees: DEAD_TREES, seed: 27 });
    z.forest({ col: W - 2, row: 19, w: 5, h: H - 22 }, { trees: DEAD_TREES, seed: 28 });
    z.port('north', 24, 1, 3, 25, 4, 1, [...SEAL]);
    z.port('west', 0, 19, 1, 3, 20, 3, [...SEAL]);
    z.port('east', W - 1, 16, 1, W - 4, 17, 3, [...SEAL]);
    z.port('south', 24, H - 2, 3, 25, H - 6, 1, [...SEAL]);

    // --- Black pools -------------------------------------------------------------------------------------------------
    for (const [col, row, w, h] of [
      [6, 6, 9, 6],
      [33, 6, 9, 6],
      [6, 26, 8, 6],
      [34, 25, 10, 7],
      [28, 12, 5, 4],
    ] as const)
      pond(z, { col, row, w, h }, { water: 'murk', shore: 'mud' });

    // --- Dead groves and stones --------------------------------------------------------------------------------------
    for (const [col, row, w, h] of [
      [16, 7, 6, 5],
      [42, 13, 5, 3],
      [14, 30, 6, 5],
      [29, 31, 4, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: DEAD_TREES, fillers: [...FILLERS], density: 0.9, fill: true });
    for (const [name, col, row] of [
      ['darkSpire', 33, 24],
      ['darkSpire', 16, 24],
      ['darkBoulder', 12, 16],
      ['deadBush', 40, 22],
      ['deadBush', 19, 35],
    ] as const)
      z.prop(name, col, row);

    // --- The sunken chapel: a ring of stones round where the chapel stood ---------------------------------------------
    for (const [col, row] of [
      [24, 22],
      [29, 22],
      [24, 27],
      [29, 27],
    ] as const)
      z.prop('menhir', col, row);
    z.spawn(26, 24);
    z.chest('wood', 'bandageKit', 44, 33);
    z.place('The Drowned Chapel', 26, 24);
    z.place('The North Causeway', 25, 6);
    z.place('The East Causeway', 46, 17);
    z.place('The West Causeway', 5, 20);
    z.place('The Black Pools', 38, 28);

    // --- Mist lanterns for a gather quest ----------------------------------------------------------------------------
    for (const [col, row] of [
      [18, 14],
      [44, 9],
      [10, 22],
      [39, 34],
      [31, 17],
    ] as const)
      z.site('mistlantern', col, row);
  },
});
