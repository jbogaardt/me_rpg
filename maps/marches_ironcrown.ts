import { defineZone } from '../tools/map/zone';
import { DEAD_TREES, GRAVES, GRAVE_CROSSES } from '../tools/map/catalog';
import { blob } from '../tools/map/helpers';
import { frame, frameRoads, type Frame } from '../tools/map/frame';

// A region for random campaigns (public/content/packs/marches.json): the Ironcrown, the ruined hall and temple of a
// king whose crown was buried with him, a graveyard of his guards in the west. A port on each edge.
const F: Frame = {
  trees: DEAD_TREES,
  seal: ['deadBush', 'darkBoulder'],
  north: 22,
  south: 26,
  west: 12,
  east: 26,
  jogRow: 19,
  jogCol: 16,
  seed: 37,
};

export default defineZone({
  name: 'marches_ironcrown',
  width: 48,
  height: 38,
  build(z) {
    z.climate('undead');
    z.fill('grass');
    z.paint('ash', { col: -2, row: -2, w: 52, h: 42 });
    const { ns, we } = frameRoads(z, F);
    z.paint('mud', [...ns, ...we]);
    z.paint('soot', blob({ col: 30, row: 7, w: 14, h: 18 }));
    frame(z, F);

    // The king's hall and temple, with fallen pillars and idols on the way up.
    z.prop('ruinHall', 31, 9);
    z.prop('ruinTemple', 36, 21);
    z.prop('ruinStatue', 31, 22);
    z.prop('ruinStatueB', 44, 22);
    z.prop('ruinPillar', 32, 14);
    z.prop('ruinPillarBroken', 41, 14);
    z.prop('ruinRubbleC', 35, 16);
    z.prop('ruinRubbleE', 39, 17);
    z.prop('ruinWallBroken', 18, 28);

    // His guards' graveyard in the north-west.
    for (const [i, col] of [5, 8, 11].entries())
      for (const [j, row] of [5, 8].entries()) z.prop(GRAVES[(i * 3 + j * 2) % GRAVES.length], col, row);
    for (const [i, [col, row]] of (
      [
        [6, 7],
        [9, 7],
        [12, 6],
      ] as const
    ).entries())
      z.prop(GRAVE_CROSSES[i % GRAVE_CROSSES.length], col, row);
    z.prop('tombA', 15, 8);

    for (const [col, row, w, h] of [
      [4, 28, 7, 6],
      [30, 30, 7, 5],
    ] as const)
      z.grove(blob({ col, row, w, h }), {
        trees: DEAD_TREES,
        fillers: ['deadBush', 'darkSpire'],
        density: 0.9,
        fill: true,
      });
    for (const [name, col, row] of [
      ['darkBoulder', 6, 16],
      ['darkSpire', 16, 32],
      ['darkBoulderB', 42, 31],
      ['deadBush', 20, 14],
      ['deadTreeD', 8, 22],
    ] as const)
      z.prop(name, col, row);

    z.spawn(25, 20);
    z.chest('iron', 'hoard', 39, 8);
    z.chest('iron', 'elixir', 33, 8);
    z.place("The King's Hall", 36, 10);
    z.place('The Guards’ Yard', 8, 8);
    for (const [col, row] of [
      [8, 12],
      [14, 23],
      [40, 33],
      [34, 25],
    ] as const)
      z.site('crownshard', col, row);
  },
});
