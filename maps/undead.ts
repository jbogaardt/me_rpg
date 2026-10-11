import { defineBiome, worldOf } from '../tools/map/world';
import { DEAD_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pond, road } from '../tools/map/helpers';
import layout from './world';

// The undead lands: ash and dead trees north of the Greenwood. A graveyard of standing stones on cracked flags,
// black chasms, a pool of lava. Roads lead south to the Greenwood, north to the beach and east into the jungle.
// Skeletons, zombies and shades: level 3-4.
// World cells: cols 77-153 at rows 42-76, plus cols 126-153 at rows 35-41 (see maps/world.ts).

const W = worldOf(layout);
const south = W.gap('undead', 'greenwood');
const north = W.gap('undead', 'beach');
const east = W.gap('undead', 'jungle');
const TRAILS = [
  ...road([
    [north.col, north.row],
    [north.col, east.row],
    [east.col, east.row],
  ]), // beach to jungle
  ...road([
    [south.col, south.row],
    [south.col, east.row],
    [north.col, east.row],
  ]), // up from the Greenwood
];
const GRAVEYARD = { col: 84, row: 60, w: 16, h: 10 };

export default defineBiome({
  name: 'undead',
  walls: { trees: DEAD_TREES },
  build(z) {
    z.fill('grass');
    z.paint('ash', z.bounds);
    z.paint('soot', [...blob({ col: 82, row: 44, w: 16, h: 10 }), ...blob({ col: 128, row: 62, w: 16, h: 10 })]);
    z.paint('mud', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(112, 66);

    // --- The graveyard: rows of standing stones on cracked flags --------------------------------------------------
    z.fill('crackedStone', GRAVEYARD);
    z.paint('ash', GRAVEYARD, { erase: true });
    z.paint('soot', GRAVEYARD, { erase: true });
    z.keepClear({ col: 83, row: 59, w: 18, h: 12 });
    for (let c = 86; c <= 97; c += 3) for (const r of [62, 65, 68]) z.prop('menhir', c, r);
    z.chest('iron', 'legionHelm', 85, 69);
    z.chest('wood', 'coins', 98, 61);
    z.mob('skeleton', 92, 64);

    // --- Chasms and a lava pool ------------------------------------------------------------------------------
    pond(z, { col: 113, row: 45, w: 10, h: 6 }, { water: 'abyss' });
    pond(z, { col: 140, row: 66, w: 7, h: 5 }, { water: 'abyss' });
    pond(z, { col: 86, row: 46, w: 8, h: 5 }, { water: 'lava', shore: 'mud' });
    z.keepClear([
      { col: 111, row: 43, w: 14, h: 10 },
      { col: 138, row: 64, w: 11, h: 9 },
      { col: 83, row: 43, w: 14, h: 11 },
    ]);
    z.chest('iron', 'relic', 146, 39);

    for (const [kind, col, row] of [
      ['skeleton', 104, 52],
      ['skeleton', 140, 48],
      ['skeleton', 126, 70],
      ['zombie', 82, 56],
      ['zombie', 120, 62],
      ['zombie', 100, 46],
      ['shade', 146, 56],
      ['shade', 128, 46],
      ['zombie', 132, 39],
      ['skeleton', 90, 72],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['deadTreeA', 'deadTreeB'], { count: 26, where: open, seed: 71 });
    z.scatter(['deadBush'], { count: 14, where: open, seed: 72 });
    z.scatter(['darkBoulder', 'darkBoulderB', 'darkSpire', 'menhir'], { count: 15, where: open, seed: 73 });
  },
});
