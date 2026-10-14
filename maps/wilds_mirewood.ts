import { defineZone } from '../tools/map/zone';
import { SWAMP_TREES } from '../tools/map/catalog';
import { blob, pond, trail } from '../tools/map/helpers';

// A region for random campaigns (public/content/packs/): the Mirewood, a soggy clearing of olive trees, ponds and a bog,
// with a keeper's camp in the middle. It can start a campaign (it has a `keeper` spot and bog-candle sites for gather
// quests). A port on each edge joins it to whichever regions the assembler puts beside it; who lives here is the
// pack's to say.
const W = 52;
const H = 40;
const TREES = [...SWAMP_TREES];
/** What closes a port nothing leads through. */
const SEAL = ['swampBush'] as const;
const FILLERS = ['swampBush', 'rockSmall'] as const;

export default defineZone({
  name: 'wilds_mirewood',
  width: W,
  height: H,
  build(z) {
    z.climate('swamp');
    z.fill('grass');

    // --- Trails: the long road north to south, and a branch to the north-west ---------------------------------------
    const road = trail([
      [25, 2],
      [25, 38],
    ]);
    const west = trail([
      [25, 14],
      [1, 14],
    ]);
    const east = trail([
      [25, 20],
      [50, 20],
    ]);
    z.paint('mud', [...road, ...west, ...east]);

    // --- Woods all round, open at the three ports -------------------------------------------------------------------
    z.forest({ col: -3, row: -3, w: 26, h: 7 }, { trees: TREES, seed: 1 });
    z.forest({ col: 28, row: -3, w: W - 25, h: 7 }, { trees: TREES, seed: 3 });
    z.forest({ col: -3, row: H - 4, w: 26, h: 7 }, { trees: TREES, seed: 4 });
    z.forest({ col: 28, row: H - 4, w: W - 25, h: 7 }, { trees: TREES, seed: 5 });
    z.forest({ col: -3, row: 4, w: 6, h: 8 }, { trees: TREES, seed: 6 });
    z.forest({ col: -3, row: 17, w: 6, h: H - 21 }, { trees: TREES, seed: 8 });
    z.forest({ col: W - 3, row: 4, w: 6, h: 14 }, { trees: TREES, seed: 7 });
    z.forest({ col: W - 3, row: 23, w: 6, h: H - 27 }, { trees: TREES, seed: 9 });
    // Where the ports lead is the content's (a pack region's `ports`); one nothing binds is walled up.
    z.port('north', 24, 1, 3, 25, 4, 1, [...SEAL]);
    z.port('west', 0, 13, 1, 3, 14, 3, [...SEAL]);
    z.port('east', W - 1, 19, 1, W - 4, 20, 3, [...SEAL]);
    z.port('south', 24, H - 2, 3, 25, H - 6, 1, [...SEAL]);

    // --- Ponds and a bog ------------------------------------------------------------------------------------------
    for (const [i, [col, row, w, h]] of (
      [
        [33, 7, 8, 5],
        [11, 22, 7, 5],
        [36, 26, 9, 6],
      ] as const
    ).entries()) {
      const water = pond(z, { col, row, w, h }, { water: i === 2 ? 'murk' : 'pond', shore: 'mud' });
      const mid = water[Math.floor(water.length / 2)];
      if (i < 2) z.prop(i ? 'lilyFlower' : 'lilyPads', mid.col + 1, mid.row);
    }

    // --- Groves -----------------------------------------------------------------------------------------------------
    for (const [col, row, w, h] of [
      [4, 26, 6, 8],
      [41, 11, 7, 5],
      [14, 5, 6, 5],
      [30, 33, 6, 3],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: [...FILLERS], density: 0.9, fill: true });
    for (const [name, col, row] of [
      ['swampTreeA', 19, 30],
      ['swampTreeC', 32, 17],
      ['swampBush', 6, 18],
      ['rockSmall', 30, 12],
      ['swampTreeE', 45, 34],
      ['rockSmall', 19, 18],
    ] as const)
      z.prop(name, col, row);

    // --- The keeper's camp --------------------------------------------------------------------------------------------
    z.spawn(26, 21);
    z.giver('keeper', 22, 19); // whichever keeper the campaign's story brings (quests.json `givers.keeper`)
    z.chest('wood', 'potion', 29, 18);
    z.chest('wood', 'bandageKit', 29, 23);
    z.sign(27, 15, { up: 'The North Road', left: 'The Old Path', down: 'The South Road', right: 'The East Road' });
    z.place('The East Road', 45, 20);
    z.place('The Camp', 25, 20);
    z.place('The North Road', 25, 6);
    z.place('The Old Path', 6, 14);
    z.place('The South Road', 25, 34);
    z.place('The Bog', 40, 28);

    // --- Bog candles for a gather quest ------------------------------------------------------------------------------
    for (const [col, row] of [
      [13, 32],
      [46, 25],
      [34, 24],
      [15, 9],
    ] as const)
      z.site('bogcandle', col, row);
  },
});
