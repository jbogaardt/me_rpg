import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { blob, pond } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Witchmire, black water and dead trees round a
// ring of standing stones where something is still called up at night. A port on each edge.
const F: Frame = {
  trees: DEAD_TREES,
  seal: ['deadBush'],
  north: 20,
  south: 38,
  west: 28,
  east: 10,
  jogRow: 22,
  jogCol: 24,
  seed: 35,
};

export default defineZone({
  name: 'marches_witchmire',
  width: 50,
  height: 40,
  build(z) {
    z.climate('swamp');
    z.fill('grass');
    z.paint('mud', { col: -2, row: -2, w: 54, h: 44 });
    const { ns, we } = frameRoads(z, F);
    z.paint('dirt', [...ns, ...we]);
    frame(z, F);

    for (const [col, row, w, h] of [
      [5, 6, 9, 6],
      [6, 16, 8, 5],
      [29, 14, 8, 4],
      [41, 14, 6, 5],
      [41, 27, 6, 6],
    ] as const)
      pond(z, { col, row, w, h }, { water: 'murk', shore: 'mud' });
    for (const [col, row, w, h] of [
      [5, 32, 8, 5],
      [15, 33, 5, 4],
      [28, 3, 8, 5],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: DEAD_TREES,
        fillers: ['deadBush', 'rockSmall'],
        density: 0.9,
        fill: true,
      });

    // The witch's ring: menhirs round a flat of black earth.
    z.paint('soot', blob({ col: 27, row: 28, w: 9, h: 7 }));
    for (const [col, row] of [
      [27, 28],
      [34, 28],
      [27, 35],
      [34, 35],
      [30, 27],
      [31, 36],
    ] as const)
      z.prop('menhir', col, row);
    for (const [name, col, row] of [
      ['darkSpire', 16, 26],
      ['darkBoulder', 14, 13],
      ['deadBush', 39, 24],
      ['deadBush', 20, 12],
      ['deadTreeB', 45, 20],
      ['darkSpire', 45, 6],
    ] as const)
      z.prop(name, col, row);

    z.spawn(25, 23);
    z.chest('iron', 'bandageKit', 30, 32);
    z.chest('iron', 'purse', 19, 25);
    z.place("The Witch's Ring", 31, 32);
    z.place('The Black Pools', 9, 9);
    for (const [col, row] of [
      [10, 24],
      [44, 11],
      [12, 29],
      [38, 20],
    ] as const)
      z.site('witchfire', col, row);
  },
});
