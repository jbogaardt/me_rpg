import { defineBiome, worldOf } from '../tools/map/world';
import { JUNGLE_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pond, road } from '../tools/map/helpers';
import layout from './world';

// The jungle: a tall band of deep green in the middle of the north, from the sea down to the Eastwood. Thick groves,
// muddy trails, a lagoon with reeds, overgrown ruins. Every neighbour has a way in: the beach, the wetlands, the undead
// lands, the marsh and the Eastwood. Orcs, trolls, wolfkin and goblins: level 4-6.
// World cells: cols 140-167 at rows 0-27, cols 147-188 at rows 28-34, cols 154-195 at rows 35-76 (see maps/world.ts).

const W = worldOf(layout);
const beach = W.gap('jungle', 'beach');
const wet = W.gap('jungle', 'wetlands');
const undead = W.gap('jungle', 'undead');
const marsh = W.gap('jungle', 'marsh');
const south = W.gap('jungle', 'eastwood');
const TRAILS = [
  ...road([
    [beach.col, beach.row],
    [wet.col, wet.row],
  ]), // the coast road, beach to wetlands
  ...road([
    [152, beach.row],
    [152, 29],
    [160, 29],
    [160, undead.row],
  ]), // south through the jungle
  ...road([
    [undead.col, undead.row],
    [marsh.col, marsh.row],
  ]), // undead lands to the marsh
  ...road([
    [south.col, undead.row],
    [south.col, south.row],
  ]), // down to the Eastwood
];

export default defineBiome({
  name: 'jungle',
  walls: { trees: JUNGLE_TREES },
  build(z) {
    z.fill('grass');
    z.paint('darkGrass', z.bounds);
    z.paint('mud', [...TRAILS, ...blob({ col: 176, row: 66, w: 10, h: 6 })]);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(166, 45);

    // --- A lagoon with reeds ----------------------------------------------------------------------------------
    const water = pond(z, { col: 174, row: 38, w: 12, h: 8 }, { shore: 'mud' });
    z.keepClear({ col: 171, row: 35, w: 18, h: 14 });
    z.prop('reeds', water[6].col + 1, water[6].row);
    z.prop('lilyFlower', water[2].col + 2, water[2].row);
    z.prop('lilyPads', water[4].col + 7, water[4].row);

    // --- Overgrown ruins with a chest ---------------------------------------------------------------------------
    z.fill('flagstone', { col: 176, row: 63, w: 8, h: 5 });
    z.paint('darkGrass', { col: 176, row: 63, w: 8, h: 5 }, { erase: true });
    z.paint('darkGrass', [{ col: 176, row: 63, w: 2, h: 2 }, ...blob({ col: 180, row: 65, w: 4, h: 3 })]);
    z.keepClear({ col: 175, row: 62, w: 10, h: 7 });
    z.prop('menhir', 176, 63);
    z.prop('menhir', 183, 63);
    z.prop('rockB', 177, 67);
    z.chest('oak', 'purse', 180, 64);
    z.mob('troll', 181, 66);

    for (const r of [
      { col: 145, row: 3, w: 7, h: 6 },
      { col: 156, row: 4, w: 6, h: 8 },
      { col: 166, row: 30, w: 8, h: 4 },
      { col: 186, row: 48, w: 6, h: 7 },
      { col: 164, row: 50, w: 6, h: 6 },
    ])
      z.forest(r, { trees: JUNGLE_TREES });
    z.chest('wood', 'potion', 146, 22);

    for (const [kind, col, row] of [
      ['orc', 162, 22],
      ['orc', 180, 32],
      ['orc', 186, 64],
      ['wolfkin', 168, 40],
      ['wolfkin', 158, 66],
      ['goblin', 150, 31],
      ['goblin', 146, 12],
      ['troll', 190, 40],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['jungleTreeA', 'jungleTreeB'], { count: 20, where: open, seed: 81 });
    z.scatter(['jungleBush'], { count: 5, where: open, seed: 82 });
    z.scatter(['rockB', 'rockC'], { count: 10, where: open, seed: 83 });
  },
});
