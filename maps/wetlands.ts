import { defineBiome, worldOf } from '../tools/map/world';
import { SWAMP_TREES } from '../tools/map/catalog';
import { awayFrom, pond, road } from '../tools/map/helpers';
import layout from './world';
import type { Rect } from '../tools/map/zone';

// The wetlands: the north-east, a soggy meadow of ponds, reeds and olive trees wrapped round the marsh. The coast
// road comes in from the jungle (west) and turns south to the marsh; a narrow strip runs down the world's east edge
// to a hidden chest. Zombies, wolfkin, goblins: level 3-4.
// World cells: cols 168-237 at rows 0-27, narrowing to cols 196-237 at rows 35-48 and cols 224-237 down to row 69.

const W = worldOf(layout);
const west = W.gap('wetlands', 'jungle');
const south = W.gap('wetlands', 'marsh');
const TRAILS = road([
  [west.col, west.row],
  [south.col, west.row],
  [south.col, south.row],
]);

export default defineBiome({
  name: 'wetlands',
  walls: { trees: SWAMP_TREES },
  build(z) {
    z.fill('grass');
    z.paint('meadow', z.bounds);
    z.paint('mud', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    z.spawn(196, 22);

    // --- Ponds -----------------------------------------------------------------------------------------------
    const ponds: Rect[] = [
      { col: 174, row: 5, w: 10, h: 6 },
      { col: 190, row: 4, w: 9, h: 7 },
      { col: 218, row: 5, w: 11, h: 6 },
      { col: 178, row: 21, w: 8, h: 4 },
      { col: 220, row: 22, w: 10, h: 7 },
      { col: 200, row: 32, w: 7, h: 5 },
      { col: 222, row: 38, w: 8, h: 5 },
    ];
    ponds.forEach((r, i) => {
      const water = pond(z, r, { water: i % 3 === 2 ? 'bog' : 'pond', shore: 'mud' });
      z.keepClear({ col: r.col - 2, row: r.row - 2, w: r.w + 4, h: r.h + 4 });
      const mid = water[Math.floor(water.length / 2)];
      z.prop(i % 2 ? 'lilyFlower' : 'lilyPads', mid.col + 1, mid.row);
      z.prop('lilyRed', mid.col + mid.w - 2, mid.row - 1);
      const foot = water[water.length - 1];
      z.prop(i % 2 ? 'reeds' : 'reedsThin', foot.col + 1, foot.row);
    });

    // --- The east strip and its hidden chest ------------------------------------------------------------------
    z.chest('oak', 'purse', 230, 64);
    z.mob('wolfkin', 230, 56);
    z.chest('wood', 'potion', 205, 8);

    for (const [kind, col, row] of [
      ['zombie', 184, 14],
      ['zombie', 204, 24],
      ['zombie', 226, 15],
      ['wolfkin', 214, 40],
      ['goblin', 172, 24],
      ['goblin', 208, 5],
      ['shade', 230, 48],
      ['zombie', 192, 30],
    ] as const)
      z.mob(kind, col, row);

    z.scatter(['swampTreeA', 'swampTreeB'], { count: 21, where: open, seed: 91 });
    z.scatter(['swampBush', 'bush'], { count: 13, where: open, seed: 92 });
    z.scatter(['flowersPurple', 'flowerRed'], { count: 40, where: open, margin: 0, seed: 93 });
  },
});
