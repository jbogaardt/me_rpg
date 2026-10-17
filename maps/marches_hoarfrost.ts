import { defineZone } from '../tools/map/zone';
import { FROST_TREES, GRAVES, GRAVE_CROSSES } from '../tools/map/catalog';
import { blob, pond } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Hoarfrost Cairns, burial mounds of an old
// northern people under permanent rime, with a frozen mere to the south. A port on each edge.
const F: Frame = {
  trees: FROST_TREES,
  seal: ['frostBush', 'frostRockB'],
  north: 30,
  south: 10,
  west: 12,
  east: 24,
  jogRow: 18,
  jogCol: 20,
  seed: 34,
};

export default defineZone({
  name: 'marches_hoarfrost',
  width: 46,
  height: 36,
  build(z) {
    z.climate('frost');
    z.fill('snow');
    z.paint('snow', { col: -2, row: -2, w: 50, h: 40 });
    const { ns, we } = frameRoads(z, F);
    z.paint('dirt', [...ns, ...we]);
    frame(z, F);

    pond(z, { col: 25, row: 27, w: 11, h: 4 }, { water: 'pond', shore: 'snow' });
    for (const [col, row, w, h] of [
      [4, 22, 5, 7],
      [13, 5, 6, 4],
      [13, 29, 5, 4],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: FROST_TREES,
        fillers: ['frostBush', 'frostRockSmall'],
        density: 0.9,
        fill: true,
      });

    // The cairn field: two tombs, headstones in rows and crosses over the poor.
    z.prop('tombA', 35, 10);
    z.prop('tombB', 40, 10);
    for (const [i, col] of [34, 37, 40, 43].entries())
      for (const [j, row] of [14, 19].entries()) z.prop(GRAVES[(i * 2 + j * 3) % GRAVES.length], col, row);
    for (const [i, [col, row]] of (
      [
        [36, 16],
        [41, 16],
        [35, 21],
        [42, 21],
      ] as const
    ).entries())
      z.prop(GRAVE_CROSSES[i % GRAVE_CROSSES.length], col, row);
    z.prop('graveBoulder', 38, 6);
    for (const [name, col, row] of [
      ['frostRock', 23, 7],
      ['frostRockB', 7, 8],
      ['frostTreeB', 27, 6],
      ['frostRockC', 8, 33],
      ['frostBush', 17, 22],
      ['frostTreeD', 41, 32],
    ] as const)
      z.prop(name, col, row);

    z.spawn(21, 19);
    z.chest('iron', 'elixir', 37, 7);
    z.chest('iron', 'purse', 24, 8);
    z.place('The Cairn Field', 38, 14);
    z.place('The Frozen Mere', 30, 29);
    for (const [col, row] of [
      [10, 6],
      [24, 5],
      [41, 24],
      [20, 29],
    ] as const)
      z.site('cairnlight', col, row);
  },
});
