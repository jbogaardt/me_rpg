import { defineZone } from '../tools/map/zone';
import { SWAMP_TREES } from '../tools/map/catalog';
import { blob, pond } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Reedmere, a wide fen of reed beds and brown
// water, crossed by raised causeways. A port on each edge.
const F: Frame = {
  trees: SWAMP_TREES,
  seal: ['swampBush'],
  north: 34,
  south: 18,
  west: 8,
  east: 28,
  jogRow: 14,
  jogCol: 26,
  seed: 33,
};

export default defineZone({
  name: 'marches_reedmere',
  width: 52,
  height: 36,
  build(z) {
    z.climate('swamp');
    z.fill('grass');
    z.paint('mud', { col: -2, row: -2, w: 56, h: 40 });
    const { ns, we } = frameRoads(z, F);
    z.paint('dirt', [...ns, ...we]);
    frame(z, F);

    for (const [i, [col, row, w, h]] of (
      [
        [5, 17, 8, 6],
        [39, 5, 8, 5],
        [40, 18, 8, 6],
        [29, 31, 8, 3],
      ] as const
    ).entries()) {
      const water = pond(z, { col, row, w, h }, { water: i % 2 ? 'murk' : 'pond', shore: 'mud' });
      const mid = water[Math.floor(water.length / 2)];
      if (i % 2 === 0) z.prop(i ? 'lilyFlower' : 'lilyPads', mid.col + 1, mid.row);
    }
    for (const [col, row, w, h] of [
      [6, 26, 6, 5],
      [20, 4, 6, 5],
      [12, 4, 4, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: SWAMP_TREES,
        fillers: ['swampBush', 'rockSmall'],
        density: 0.9,
        fill: true,
      });
    for (const [name, col, row] of [
      ['swampTreeA', 21, 20],
      ['swampTreeC', 30, 20],
      ['swampBush', 22, 28],
      ['rockSmall', 31, 9],
      ['swampTreeE', 46, 31],
      ['reedBed', 16, 12],
    ] as const)
      z.prop(name, col, row);

    z.spawn(27, 16);
    z.chest('wood', 'bandageKit', 30, 12);
    z.chest('wood', 'purse', 21, 31);
    z.place('The Causeway', 26, 20);
    z.place('The Reed Beds', 9, 20);
    z.place('The Black Water', 43, 21);
    for (const [col, row] of [
      [14, 31],
      [44, 12],
      [22, 24],
      [33, 24],
    ] as const)
      z.site('marshlamp', col, row);
  },
});
