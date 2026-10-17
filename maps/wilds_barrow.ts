import { defineZone } from '../tools/map/zone';
import { DEAD_TREES, GRAVES, GRAVE_CROSSES } from '../tools/map/catalog';
import { blob, pond, trail } from '../tools/map/helpers';

// A region for random campaigns (public/content/packs/): the Barrow, a field of ash and standing stones round an old
// lord's mound, a chasm in the east. A port on each edge; a hard region, where a story can end in a boss fight.
const W = 46;
const H = 34;
const TREES = [...DEAD_TREES];
/** What closes a port nothing leads through. */
const SEAL = ['deadBush', 'darkBoulder', 'deadBush'] as const;
const FILLERS = ['deadBush', 'darkSpire'] as const;

export default defineZone({
  name: 'wilds_barrow',
  width: W,
  height: H,
  build(z) {
    z.climate('undead');
    z.fill('grass');
    z.paint('ash', { col: -2, row: -2, w: W + 4, h: H + 4 });
    const road = trail([
      [22, 32],
      [22, 20],
      [32, 20],
      [32, 10],
      [22, 10],
      [22, 2],
    ]);
    const sides = [
      ...trail([
        [22, 22],
        [1, 22],
      ]),
      ...trail([
        [32, 15],
        [44, 15],
      ]),
    ];
    z.paint('mud', [...road, ...sides]);
    z.paint('soot', blob({ col: 6, row: 9, w: 12, h: 9 })); // the mound's trodden ground

    z.forest({ col: -3, row: -3, w: 24, h: 7 }, { trees: TREES, seed: 1 });
    z.forest({ col: 26, row: -3, w: W - 23, h: 7 }, { trees: TREES, seed: 2 });
    z.forest({ col: -3, row: H - 4, w: 24, h: 7 }, { trees: TREES, seed: 3 });
    z.forest({ col: 26, row: H - 4, w: W - 23, h: 7 }, { trees: TREES, seed: 4 });
    z.forest({ col: -3, row: 4, w: 6, h: 16 }, { trees: TREES, seed: 5 });
    z.forest({ col: -3, row: 25, w: 6, h: H - 29 }, { trees: TREES, seed: 7 });
    z.forest({ col: W - 3, row: 4, w: 6, h: 9 }, { trees: TREES, seed: 6 });
    z.forest({ col: W - 3, row: 18, w: 6, h: H - 22 }, { trees: TREES, seed: 8 });
    // Where the ports lead is the content's (a pack region's `ports`); one nothing binds is walled up.
    z.port('north', 21, 1, 3, 22, 4, 1, [...SEAL]);
    z.port('south', 21, H - 2, 3, 22, H - 6, 1, [...SEAL]);
    z.port('west', 0, 21, 1, 3, 22, 3, [...SEAL]);
    z.port('east', W - 1, 14, 1, W - 4, 15, 3, [...SEAL]);

    // The old lord's burial ground: headstones in rows round the mound, two tombs flanking it, crosses over the poor.
    z.prop('tombA', 7, 12);
    z.prop('tombB', 16, 12);
    for (const [i, col] of [6, 10, 14, 18].entries())
      for (const [j, row] of [8, 18].entries()) z.prop(GRAVES[(i * 3 + j * 4) % GRAVES.length], col, row);
    for (const [i, [col, row]] of (
      [
        [8, 9],
        [12, 9],
        [16, 9],
        [8, 17],
        [12, 17],
        [16, 17],
        [5, 13],
        [19, 13],
      ] as const
    ).entries())
      z.prop(GRAVE_CROSSES[i % GRAVE_CROSSES.length], col, row);
    // A fallen gatehouse and two idols at the mound's foot (LPC Jungle Ruins, ruins.png).
    z.prop('ruinWallBroken', 9, 6);
    z.prop('ruinStatue', 6, 20);
    z.prop('ruinStatueB', 17, 20);
    z.prop('ruinRubbleC', 12, 20);
    pond(z, { col: 36, row: 22, w: 6, h: 5 }, { water: 'abyss' });
    pond(z, { col: 8, row: 25, w: 4, h: 2 }, { water: 'lava', shore: 'mud' });

    for (const [col, row, w, h] of [
      [36, 5, 6, 6],
      [27, 25, 5, 4],
      [3, 28, 3, 3],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: [...FILLERS], density: 0.9, fill: true });
    for (const [name, col, row] of [
      ['darkBoulder', 26, 15],
      ['darkSpire', 41, 19],
      ['deadTreeB', 14, 27],
      ['darkBoulderB', 16, 4],
      ['deadTreeD', 40, 30],
    ] as const)
      z.prop(name, col, row);

    z.spawn(22, 28);
    z.chest('iron', 'hoard', 11, 12);
    z.chest('iron', 'elixir', 13, 12);
    z.place('The Mound', 12, 13);
    z.place('The Rift', 39, 24);
    for (const [col, row] of [
      [8, 15],
      [17, 14],
      [42, 12],
      [26, 27],
    ] as const)
      z.site('gravelight', col, row);
  },
});
