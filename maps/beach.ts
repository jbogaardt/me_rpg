import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, blob, pond, trail, units } from '../tools/map/helpers';
import layout from './world';

// The beach: sand on the northern sea between the desert and the jungle, with a wreck, tide pools and rocks. The sea
// closes the north of the world here instead of trees. The coast road runs through it (desert in the west, jungle in
// the east) and a trail turns south into the undead lands. Raiders off the wreck, goblins and wolfkin: level 2-4.
// Squares x 14-19 at y 0-3, then x 12-20 at y 4 and x 12-17 at y 5 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('beach', to);
  return [g.col, g.row];
};
const [west, east, south] = [gap('desert'), gap('jungle'), gap('undead')];
const TRAILS = [...trail([west, east], { swing: 1.5 }), ...trail([[south[0], east[1]], south])];
/** The first land row of each column: a shore that swings in and out. */
const shore = (col: number) => Math.round(11 + 2.6 * Math.sin(col / 8.3) + 1.6 * Math.sin(col / 3.7 + 1));

export default defineBiome({
  name: 'beach',
  climate: 'coast',
  walls: { trees: TREES },
  worldEdge: false, // the sea closes the north
  build(z) {
    z.fill('sea');
    const { col, w } = z.bounds;
    for (let c = col - 3; c < col + w + 3; c++) {
      z.paint('coast', { col: c, row: shore(c), w: 1, h: 60 - shore(c) });
      z.block({ col: c, row: 0, w: 1, h: shore(c) }, 'the sea');
    }
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(15.6, 2.8));

    // --- A wreck washed up on the sand -----------------------------------------------------------------------
    for (const [x, y] of [
      [16.2, 3.2],
      [16.3, 3.4],
      [16.1, 3.5],
      [16.5, 3.2],
    ] as const)
      z.prop('barrel', ...near(x, y));
    z.prop('darkBoulder', ...near(16.8, 3.4));
    z.chest('wood', 'purse', ...near(16.4, 3.6));
    z.mob('raider', ...near(15.8, 3.6));

    // --- Tide pools and rocks --------------------------------------------------------------------------------
    for (const [x, y, w, h] of [
      [12.6, 5.1, 1.2, 0.5],
      [15.2, 4.4, 1.2, 0.5],
      [17.6, 1.6, 0.8, 0.5],
    ] as const) {
      pond(z, area(x, y, w, h));
      z.keepClear(area(x - 0.2, y - 0.2, w + 0.4, h + 0.4));
    }
    z.chest('wood', 'bandageKit', ...near(13.8, 5.4));

    // --- Grass where the beach meets the jungle -------------------------------------------------------------
    z.paint('meadow', blob(area(18.2, 3.4, 2.4, 1.6)));
    z.grove(blob(area(18.8, 4.2, 1.2, 0.6)), { trees: TREES });

    for (const [kind, x, y] of [
      ['raider', 14.6, 2.2],
      ['goblin', 17.6, 4.4],
      ['goblin', 13.2, 4.6],
      ['wolfkin', 19.2, 3.4],
      ['raider', 16.4, 5.4],
      ['raider', 18.4, 1.8],
      ['goblin', 15, 5.6],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter(['sandBoulder', 'sandBoulderB', 'sandSpire'], { count: 18, where: open, seed: 61 });
    z.scatter(['rockSmall', 'rockC', 'rock'], { count: 20, where: open, seed: 62 });
    z.scatter(['bush'], { count: 6, where: (c, r) => open(c, r) && c > 180, seed: 63 });
  },
});
