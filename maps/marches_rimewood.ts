import { defineZone } from '../tools/map/zone';
import { FROST_TREES } from '../tools/map/catalog';
import { blob } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Rimewood, a pine forest under old snow, with
// frozen meres and wolf runs between the groves. A port on each edge.
const F: Frame = {
  trees: FROST_TREES,
  seal: ['frostBush'],
  north: 25,
  south: 14,
  west: 20,
  east: 12,
  jogRow: 24,
  jogCol: 30,
  seed: 32,
};

export default defineZone({
  name: 'marches_rimewood',
  width: 50,
  height: 38,
  build(z) {
    z.climate('frost');
    z.fill('snow');
    z.paint('snow', { col: -2, row: -2, w: 54, h: 42 });
    const { ns, we } = frameRoads(z, F);
    z.paint('dirt', [...ns, ...we]);
    for (const [col, row, w, h] of [
      [35, 17, 9, 6],
      [5, 7, 6, 4],
    ] as const)
      z.paint('ice', blob({ col, row, w, h }));
    frame(z, F);

    for (const [col, row, w, h] of [
      [6, 27, 6, 5],
      [41, 28, 6, 5],
      [12, 7, 6, 5],
      [34, 4, 8, 3],
      [20, 29, 4, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: FROST_TREES,
        fillers: ['frostBush', 'frostRockSmall'],
        density: 0.9,
        fill: true,
      });
    for (const [name, col, row] of [
      ['frostRock', 18, 15],
      ['frostRockB', 44, 14],
      ['frostTreeA', 29, 7],
      ['frostTreeC', 7, 17],
      ['frostRockC', 34, 31],
      ['frostBush', 40, 24],
      ['frostTreeE', 22, 33],
    ] as const)
      z.prop(name, col, row);

    z.spawn(26, 21);
    z.chest('oak', 'potion', 28, 18);
    z.chest('oak', 'purse', 9, 24);
    z.place('The Wolf Run', 31, 15);
    z.place('The Frozen Mere', 39, 20);
    z.place('The Pine Fold', 36, 5);
    for (const [col, row] of [
      [18, 9],
      [40, 33],
      [8, 31],
      [33, 29],
    ] as const)
      z.site('rimeberry', col, row);
  },
});
