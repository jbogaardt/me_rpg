import { defineBiome, worldOf } from '../tools/map/world';
import { awayFrom, blob, pond, trail, units } from '../tools/map/helpers';
import layout from './world';

// The wetlands: the north-east, a soggy meadow of ponds, reeds and olive trees wrapped round the marsh. The coast road
// comes in from the jungle (west) and turns south to the marsh; a narrow strip runs down the world's east edge to a
// hidden chest. Zombies, wolfkin, goblins: level 3-4.
// Squares x 24-33 at y 0-3, narrowing to x 28-33 at y 5-6 and x 32-33 down to y 9 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('wetlands', to);
  return [g.col, g.row];
};
const [west, south] = [gap('jungle'), gap('marsh')];
const TRAILS = trail([west, [south[0], west[1]], south]);
const KIT = { trees: ['swampTreeA', 'swampTreeB'], fillers: ['swampBush', 'rockSmall'] } as const;

export default defineBiome({
  name: 'wetlands',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.paint('meadow', z.bounds);
    z.paint('mud', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(29, 3.2));

    // --- Ponds, pools and a bog --------------------------------------------------------------------------------
    for (const [i, [x, y, w, h]] of (
      [
        [24.8, 0.6, 1.6, 1],
        [27, 0.5, 1.4, 1.1],
        [31.2, 0.6, 1.8, 1],
        [25.2, 3.1, 1.2, 0.7],
        [27.6, 3.4, 1.6, 0.9],
        [31.4, 3, 1.6, 1.2],
        [29, 5.1, 1, 0.8],
        [31.6, 5.4, 1.2, 0.8],
        [29.8, 0.9, 0.8, 0.6],
      ] as const
    ).entries()) {
      const water = pond(z, area(x, y, w, h), { water: i % 4 === 2 ? 'bog' : 'pond', shore: 'mud' });
      z.keepClear(area(x - 0.2, y - 0.2, w + 0.4, h + 0.4));
      const mid = water[Math.floor(water.length / 2)];
      z.prop(i % 2 ? 'lilyFlower' : 'lilyPads', mid.col + 1, mid.row);
      z.prop('lilyRed', mid.col + mid.w - 2, mid.row - 1);
      const foot = water[water.length - 1];
      z.prop(i % 2 ? 'reeds' : 'reedsThin', foot.col, foot.row);
    }

    // --- The east strip and its hidden chest ------------------------------------------------------------------
    z.chest('oak', 'purse', ...near(32.8, 9.2));
    z.mob('wolfkin', ...near(32.8, 8.2));
    z.chest('wood', 'potion', ...near(28.6, 1.6));

    for (const [x, y, w, h] of [
      [26.2, 1.8, 1, 0.8],
      [29.2, 2.2, 1, 0.6],
      [32.6, 2.2, 1, 0.8],
      [28.4, 4.2, 0.8, 0.6],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: [...KIT.trees], fillers: [...KIT.fillers] });

    for (const [kind, x, y] of [
      ['zombie', 26, 2.2],
      ['zombie', 30.4, 2.6],
      ['zombie', 32.6, 1.4],
      ['wolfkin', 30, 6.2],
      ['goblin', 24.6, 2.6],
      ['goblin', 28.6, 0.8],
      ['shade', 32.8, 7],
      ['zombie', 27, 4.4],
      ['wolfkin', 33, 4.6],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter(['swampTreeA', 'swampTreeB'], { count: 35, where: open, seed: 91 });
    z.scatter(['swampBush', 'bush'], { count: 40, where: open, seed: 92 });
    z.scatter(['flowersPurple', 'flowerRed'], { count: 60, where: open, margin: 0, seed: 93 });
  },
});
