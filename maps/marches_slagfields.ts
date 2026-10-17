import { defineZone } from '../tools/map/zone';
import { DEAD_TREES } from '../tools/map/catalog';
import { blob, pond } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Slagfields, black glass and red earth round
// lakes of molten rock, where the Warden's smiths once worked. A port on each edge.
const F: Frame = {
  trees: DEAD_TREES,
  seal: ['darkBoulder', 'deadBush'],
  north: 26,
  south: 10,
  west: 14,
  east: 30,
  jogRow: 26,
  jogCol: 36,
  seed: 36,
};

export default defineZone({
  name: 'marches_slagfields',
  width: 52,
  height: 38,
  build(z) {
    z.climate('undead');
    z.fill('grass');
    z.paint('ash', { col: -2, row: -2, w: 56, h: 42 });
    const { ns, we } = frameRoads(z, F);
    z.paint('mud', [...ns, ...we]);
    z.paint('soot', blob({ col: 14, row: 19, w: 11, h: 5 }));
    frame(z, F);

    pond(z, { col: 32, row: 5, w: 12, h: 5 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 5, row: 6, w: 8, h: 4 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 15, row: 29, w: 8, h: 4 }, { water: 'lava', shore: 'mud' });
    pond(z, { col: 42, row: 19, w: 5, h: 4 }, { water: 'lava', shore: 'mud' });
    z.stamp('crater', 17, 27);
    z.stamp('crater', 40, 32);
    for (const [col, row, w, h] of [
      [4, 24, 5, 7],
      [29, 29, 5, 5],
      [18, 5, 6, 5],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: DEAD_TREES,
        fillers: ['deadBush', 'darkSpire'],
        density: 0.9,
        fill: true,
      });
    for (const [name, col, row] of [
      ['darkBoulder', 28, 18],
      ['darkSpire', 41, 15],
      ['darkBoulderB', 11, 20],
      ['darkSpire', 27, 22],
      ['darkBoulder', 45, 29],
      ['deadTreeC', 6, 15],
    ] as const)
      z.prop(name, col, row);

    z.spawn(27, 15);
    z.chest('iron', 'hoard', 20, 21);
    z.chest('iron', 'elixir', 22, 21);
    z.place("The Smiths' Hollow", 19, 21);
    z.place('The Molten Lake', 37, 7);
    for (const [col, row] of [
      [9, 13],
      [45, 12],
      [30, 24],
      [24, 33],
    ] as const)
      z.site('slagglass', col, row);
  },
});
