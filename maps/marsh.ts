import { defineBiome, worldOf } from '../tools/map/world';
import { SWAMP_TREES } from '../tools/map/catalog';
import { road } from '../tools/map/helpers';
import layout from './world';

// The marsh: a sunken bog walled in by the wetlands, the jungle and the Frostlands. Two muddy causeways cross it (from
// the jungle in the west, and north-south from the wetlands to the Frostlands) and a little island holds a chest, with
// a troll on guard. Zombies and a troll: level 5-6.
// World cells: cols 196-223, rows 49-69 (see maps/world.ts).

const W = worldOf(layout);
const west = W.gap('marsh', 'jungle');
const north = W.gap('marsh', 'wetlands');
const south = W.gap('marsh', 'frostlands');
const BOG = { col: 199, row: 52, w: 22, h: 15 };
const DRY = [
  ...road([
    [west.col, west.row],
    [north.col, west.row],
  ]), // the causeway from the jungle
  ...road([
    [north.col, north.row],
    [south.col, south.row],
  ]), // north-south, wetlands to Frostlands
  { col: 201, row: 52, w: 7, h: 4 }, // the island
  { col: 203, row: 56, w: 2, h: 2 }, // and the spit out to it
];

export default defineBiome({
  name: 'marsh',
  walls: { trees: SWAMP_TREES },
  build(z) {
    z.fill('grass');
    z.paint('mud', z.bounds);
    z.paint('bog', BOG);
    z.block(BOG, 'bog');
    for (const r of DRY) {
      z.paint('bog', r, { erase: true });
      z.unblock(r);
    }
    z.keepClear(BOG);
    z.spawn(206, 59);

    z.chest('oak', 'elixir', 202, 53);
    z.mob('troll', 205, 54);
    for (const [kind, col, row] of [
      ['zombie', 200, 59],
      ['zombie', 213, 54],
      ['zombie', 213, 65],
    ] as const)
      z.mob(kind, col, row);

    // Reeds are tall (4.5 cells): stand them where everything they cover is bog or wall.
    for (const [name, col, row] of [
      ['reeds', 208, 57],
      ['reedsThin', 216, 57],
      ['reeds', 217, 57],
      ['reeds', 200, 66],
      ['reeds', 208, 66],
      ['reedsThin', 216, 66],
      ['lilyPads', 210, 53],
      ['lilyFlower', 203, 63],
      ['lilyRed', 218, 63],
      ['lilyPads', 206, 62],
      ['lilyFlowerB', 219, 54],
    ] as const)
      z.prop(name, col, row);
  },
});
