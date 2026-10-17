import { defineZone } from '../tools/map/zone';
import { TREES } from '../tools/map/catalog';
import { blob, pond, reedsAt, trail } from '../tools/map/helpers';

// A region for random and live worlds (public/content/packs/heartlands.json): the Thornwood, an old green wood of
// thickets and a winding stream, with standing stones in a clearing and a hunter's hollow. Beasts live here (the pack
// says which). A port on each edge joins it to whichever region the world puts beside it.
const W = 54;
const H = 42;
/** What closes a port nothing leads through. */
const SEAL = ['bush'] as const;
const FILLERS = ['bush', 'rockSmall', 'rockB'] as const;

export default defineZone({
  name: 'heart_thornwood',
  width: W,
  height: H,
  build(z) {
    z.climate('temperate');
    z.fill('grass');

    // --- Trails: a crooked one north to south, and the cross-path by the stones --------------------------------------
    const ways = [
      ...trail([
        [26, 2],
        [26, 11],
        [22, 11],
        [22, 22],
        [30, 22],
        [30, 31],
        [26, 31],
        [26, 40],
      ]),
      ...trail([
        [1, 18],
        [14, 18],
        [14, 22],
        [22, 22],
      ]),
      ...trail([
        [30, 22],
        [30, 24],
        [52, 24],
      ]),
    ];
    z.paint('dirt', ways);

    // --- Woods all round, open at the four ports ---------------------------------------------------------------------
    z.forest({ col: -3, row: -3, w: 28, h: 6 }, { trees: TREES, seed: 11 });
    z.forest({ col: 28, row: -3, w: W - 25, h: 6 }, { trees: TREES, seed: 12 });
    z.forest({ col: -3, row: H - 3, w: 28, h: 6 }, { trees: TREES, seed: 13 });
    z.forest({ col: 28, row: H - 3, w: W - 25, h: 6 }, { trees: TREES, seed: 14 });
    z.forest({ col: -3, row: 3, w: 5, h: 14 }, { trees: TREES, seed: 15 });
    z.forest({ col: -3, row: 20, w: 5, h: H - 23 }, { trees: TREES, seed: 16 });
    z.forest({ col: W - 2, row: 3, w: 5, h: 20 }, { trees: TREES, seed: 17 });
    z.forest({ col: W - 2, row: 26, w: 5, h: H - 29 }, { trees: TREES, seed: 18 });
    z.port('north', 25, 1, 3, 26, 4, 1, [...SEAL]);
    z.port('west', 0, 17, 1, 3, 18, 3, [...SEAL]);
    z.port('east', W - 1, 23, 1, W - 4, 24, 3, [...SEAL]);
    z.port('south', 25, H - 2, 3, 26, H - 6, 1, [...SEAL]);

    // --- The stream's pools ---------------------------------------------------------------------------------------
    for (const [col, row, w, h] of [
      [36, 8, 8, 5],
      [8, 27, 8, 5],
    ] as const) {
      const water = pond(z, { col, row, w, h }, { shore: 'sand' });
      const mid = water[Math.floor(water.length / 2)];
      if (mid) z.prop('lilyFlower', mid.col + 1, mid.row);
      reedsAt(z, water, 2, 'w', 'reedStalks');
    }

    // --- Thickets: the wood is dense, the paths are the way through ------------------------------------------------
    for (const [col, row, w, h] of [
      [5, 5, 12, 8],
      [31, 13, 6, 6],
      [42, 29, 8, 8],
      [16, 31, 7, 6],
      [6, 21, 6, 4],
      [44, 15, 5, 5],
      [33, 33, 5, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: [...FILLERS], density: 1, fill: true });

    // --- Single trees and thorn bushes between the thickets ----------------------------------------------------------
    for (const [i, [col, row]] of (
      [
        [10, 4],
        [18, 6],
        [33, 5],
        [45, 5],
        [4, 13],
        [17, 15],
        [37, 16],
        [48, 19],
        [7, 24],
        [16, 26],
        [38, 27],
        [47, 27],
        [5, 35],
        [21, 37],
        [36, 37],
        [44, 36],
        [12, 11],
        [40, 3],
        [20, 28],
        [35, 31],
      ] as const
    ).entries())
      z.prop(i % 3 === 2 ? 'bush' : TREES[i % TREES.length], col, row);

    // --- The standing stones in the clearing, and the hunter's hollow ------------------------------------------------
    for (const [col, row] of [
      [24, 18],
      [28, 18],
      [33, 19],
      [19, 19],
    ] as const)
      z.prop('menhir', col, row);
    z.spawn(26, 22);
    z.sign(27, 20, {
      up: 'The North Path',
      left: "The Hunter's Hollow",
      right: 'The East Path',
      down: 'The South Path',
    });
    z.chest('wood', 'potion', 9, 16);
    z.place('The Old Stones', 26, 19);
    z.place("The Hunter's Hollow", 9, 18);
    z.place('The North Path', 25, 6);
    z.place('The East Path', 47, 24);
    z.place('The South Path', 28, 36);
    z.place('The Stream', 40, 10);

    // --- Thornberries for a gather quest ----------------------------------------------------------------------------
    for (const [col, row] of [
      [19, 13],
      [38, 20],
      [13, 36],
      [47, 12],
      [36, 28],
    ] as const)
      z.site('thornberry', col, row);
  },
});
