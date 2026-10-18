import { defineZone } from '../tools/map/zone';
import { AUTUMN_TREES } from '../tools/map/catalog';
import { blob } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Harvestwood, an orange autumn wood carpeted in
// fallen leaves, with clearings of old standing stones between the groves. A port on each edge.
const F: Frame = {
  trees: AUTUMN_TREES,
  seal: ['autumnBush'],
  north: 26,
  south: 18,
  west: 16,
  east: 22,
  jogRow: 20,
  jogCol: 28,
  seed: 41,
};

export default defineZone({
  name: 'marches_harvestwood',
  width: 50,
  height: 38,
  build(z) {
    z.climate('temperate');
    z.fill('grass');
    const { ns, we } = frameRoads(z, F);
    // Leaf litter: big patches of bare earth over the grass, which shows only between them, and the roads.
    for (const [col, row, w, h] of [
      [2, 3, 22, 11],
      [27, 3, 21, 10],
      [3, 18, 17, 9],
      [23, 15, 25, 8],
      [5, 28, 20, 8],
      [28, 26, 20, 9],
    ] as const)
      z.paint('dirt', blob({ col, row, w, h }));
    z.paint('dirt', [...ns, ...we]);
    frame(z, F);

    for (const [col, row, w, h] of [
      [5, 6, 8, 5],
      [33, 7, 8, 4],
      [10, 26, 8, 5],
      [35, 27, 7, 4],
      [20, 5, 5, 4],
      [28, 30, 4, 4],
      [3, 19, 11, 6],
      [36, 15, 10, 5],
      [30, 9, 6, 4],
      [20, 25, 7, 5],
      [3, 30, 8, 5],
      [41, 30, 6, 5],
      [12, 11, 6, 4],
      [36, 33, 8, 3],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: AUTUMN_TREES,
        fillers: ['autumnBush', 'autumnBushSmall', 'rockSmall'],
        density: 0.9,
        fill: true,
      });
    for (const [name, col, row] of [
      ['autumnTreeA', 21, 17],
      ['autumnTreeD', 40, 17],
      ['autumnTreeB', 8, 18],
      ['autumnBush', 30, 24],
      ['rock', 23, 28],
      ['rockSmall', 36, 14],
      ['autumnTreeF', 14, 33],
      ['autumnBushSmall', 44, 33],
    ] as const)
      z.prop(name, col, row);

    z.spawn(26, 21);
    z.chest('oak', 'potion', 29, 22);
    z.chest('oak', 'purse', 11, 21);
    z.place('The Standing Stones', 24, 15);
    z.place('The Leaf Hollow', 38, 10);
    z.place('The Cider Press', 12, 28);
    for (const [col, row] of [
      [16, 10],
      [40, 31],
      [9, 30],
      [34, 13],
    ] as const)
      z.site('embercap', col, row);
  },
});
