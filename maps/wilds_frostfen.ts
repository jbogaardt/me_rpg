import { defineZone } from '../tools/map/zone';
import { FROST_TREES } from '../tools/map/catalog';
import { blob, trail } from '../tools/map/helpers';

// A region for random campaigns (public/content/packs/): the Frostfen, a snowfield of frozen meres between pine woods.
// A middle region: two ports (north and south), a frozen lake to slide on and frost-stones for gather quests.
const W = 46;
const H = 34;
const TREES = [...FROST_TREES];
const FILLERS = ['frostBush', 'frostRockSmall'] as const;

export default defineZone({
  name: 'wilds_frostfen',
  width: W,
  height: H,
  build(z) {
    z.climate('frost');
    z.fill('snow');
    z.paint('snow', { col: -2, row: -2, w: W + 4, h: H + 4 });
    const road = trail([
      [22, 2],
      [22, 12],
      [12, 12],
      [12, 22],
      [22, 22],
      [22, 32],
    ]);
    z.paint('dirt', road);

    z.forest({ col: -3, row: -3, w: 24, h: 7 }, { trees: TREES, seed: 1 });
    z.forest({ col: 26, row: -3, w: W - 23, h: 7 }, { trees: TREES, seed: 2 });
    z.forest({ col: -3, row: H - 4, w: 24, h: 7 }, { trees: TREES, seed: 3 });
    z.forest({ col: 26, row: H - 4, w: W - 23, h: 7 }, { trees: TREES, seed: 4 });
    z.forest({ col: -3, row: 4, w: 6, h: H - 8 }, { trees: TREES, seed: 5 });
    z.forest({ col: W - 3, row: 4, w: 6, h: H - 8 }, { trees: TREES, seed: 6 });
    // Where the ports lead is the content's (a pack region's `ports`); one nothing binds is walled up.
    z.port('north', 21, 1, 3, 22, 4);
    z.port('south', 21, H - 2, 3, 22, H - 6);

    // Frozen meres: slippery, not blocked.
    for (const [col, row, w, h] of [
      [27, 13, 11, 7],
      [5, 6, 5, 3],
      [30, 25, 6, 3],
    ] as const)
      z.paint('ice', blob({ col, row, w, h }));

    for (const [col, row, w, h] of [
      [4, 23, 5, 6],
      [33, 5, 8, 5],
      [15, 4, 4, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), { trees: TREES, fillers: [...FILLERS], density: 0.9, fill: true });
    for (const [name, col, row] of [
      ['frostRock', 17, 17],
      ['frostRockB', 40, 22],
      ['frostTreeA', 28, 9],
      ['frostTreeC', 8, 15],
      ['frostRockC', 26, 28],
      ['frostBush', 38, 29],
    ] as const)
      z.prop(name, col, row);

    z.spawn(22, 6);
    z.chest('oak', 'purse', 7, 18);
    z.place('The Frozen Mere', 32, 16);
    z.place('The Pinefold', 37, 7);
    for (const [col, row] of [
      [6, 11],
      [41, 12],
      [16, 27],
      [36, 23],
    ] as const)
      z.site('froststone', col, row);
  },
});
