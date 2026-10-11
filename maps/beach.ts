import { defineBiome, worldOf } from '../tools/map/world';
import { TREES } from '../tools/map/catalog';
import { awayFrom, pond, road } from '../tools/map/helpers';
import layout from './world';

// The beach: sand on the northern sea between the desert and the jungle, with a wreck, tide pools and rocks. The sea
// closes the north of the world here instead of trees. The coast road runs through it (desert in the west, jungle in
// the east) and a trail turns south into the undead lands. Raiders off the wreck, goblins and wolfkin: level 2-4.
// World cells: cols 98-139 at rows 0-27, then cols 84-146 at rows 28-34 and cols 84-125 at rows 35-41.

const W = worldOf(layout);
const west = W.gap('beach', 'desert');
const east = W.gap('beach', 'jungle');
const south = W.gap('beach', 'undead');
const TRAILS = [
  ...road([
    [west.col, west.row],
    [east.col, east.row],
  ]), // the coast road
  ...road([
    [south.col, east.row],
    [south.col, south.row],
  ]), // south to the undead lands
];
/** First land row of each stretch of the shore (the sea is everything above it). */
const SHORE: [col: number, w: number, row: number][] = [
  [98, 7, 11],
  [105, 6, 9],
  [111, 8, 12],
  [119, 5, 10],
  [124, 9, 8],
  [133, 7, 11],
];

export default defineBiome({
  name: 'beach',
  walls: { trees: TREES },
  worldEdge: false, // the sea closes the north
  build(z) {
    z.fill('sea');
    z.paint('coast', [
      { col: 84, row: 28, w: 63, h: 14 },
      ...SHORE.map(([col, w, row]) => ({ col, row, w, h: 28 - row })),
    ]);
    for (const [col, w, row] of SHORE) z.block({ col, row: 0, w, h: row }, 'the sea');
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(110, 21);

    // --- A wreck washed up on the sand -----------------------------------------------------------------------
    for (const [c, r] of [
      [118, 22],
      [119, 23],
      [117, 24],
      [120, 22],
    ])
      z.prop('barrel', c, r);
    z.prop('darkBoulder', 122, 23);
    z.chest('wood', 'purse', 119, 24);
    z.mob('raider', 115, 23);
    z.keepClear({ col: 115, row: 21, w: 10, h: 5 });

    // --- Tide pools ------------------------------------------------------------------------------------------
    pond(z, { col: 92, row: 33, w: 6, h: 4 });
    pond(z, { col: 108, row: 34, w: 7, h: 4 });
    z.keepClear([
      { col: 90, row: 31, w: 10, h: 8 },
      { col: 106, row: 32, w: 11, h: 8 },
    ]);
    z.chest('wood', 'bandageKit', 100, 36);

    // --- Grass where the beach meets the jungle -------------------------------------------------------------
    z.paint('meadow', { col: 128, row: 22, w: 19, h: 13 });

    for (const [kind, col, row] of [
      ['raider', 104, 14],
      ['goblin', 125, 30],
      ['goblin', 100, 31],
      ['wolfkin', 131, 24],
      ['raider', 118, 36],
      ['raider', 128, 13],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['sandBoulder', 'sandBoulderB', 'sandSpire'], { count: 12, where: open, seed: 61 });
    z.scatter(['bush'], { count: 3, where: (c, r) => open(c, r) && c > 128, seed: 63 });
    z.scatter(['rockSmall', 'rockC', 'rock'], { count: 14, where: open, seed: 62 });
  },
});
