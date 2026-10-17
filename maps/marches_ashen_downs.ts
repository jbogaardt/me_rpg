import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { blob, pond } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Ashen Downs, open scrub of grey ash and red earth
// where hounds run the ridges, with vents of lava in the hollows. A port on each edge.
const F: Frame = {
  trees: DEAD_TREES,
  seal: ['deadBush', 'darkBoulder', 'deadBush'],
  north: 12,
  south: 36,
  west: 10,
  east: 26,
  jogRow: 17,
  jogCol: 24,
  seed: 31,
};

export default defineZone({
  name: 'marches_ashen_downs',
  width: 48,
  height: 36,
  build(z) {
    z.climate('undead');
    z.fill('grass');
    z.paint('ash', { col: -2, row: -2, w: 52, h: 40 });
    const { ns, we } = frameRoads(z, F);
    z.paint('mud', [...ns, ...we]);
    z.paint('soot', blob({ col: 28, row: 20, w: 7, h: 6 }));
    frame(z, F);

    pond(z, { col: 32, row: 6, w: 7, h: 4 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 5, row: 27, w: 6, h: 3 }, { water: 'lava', shore: 'mud' });
    z.stamp('crater', 16, 22);
    z.stamp('dune', 39, 21);
    for (const [col, row, w, h] of [
      [15, 4, 6, 4],
      [15, 29, 6, 3],
      [39, 28, 5, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: DEAD_TREES,
        fillers: ['deadBush', 'darkSpire'],
        density: 0.9,
        fill: true,
      });
    for (const [name, col, row] of [
      ['darkBoulder', 6, 14],
      ['darkSpire', 41, 14],
      ['darkBoulderB', 31, 29],
      ['darkSpire', 8, 5],
      ['deadBush', 20, 24],
      ['deadTreeB', 42, 33],
    ] as const)
      z.prop(name, col, row);

    z.spawn(25, 18);
    z.chest('iron', 'purse', 27, 14);
    z.chest('iron', 'bandageKit', 8, 22);
    z.place('The Ash Road', 36, 25);
    z.place('The Hound Ridge', 40, 12);
    z.place('The Vents', 35, 8);
    for (const [col, row] of [
      [20, 7],
      [42, 11],
      [9, 31],
      [30, 25],
    ] as const)
      z.site('warmstone', col, row);
  },
});
