import { defineBiome, worldOf } from '../tools/map/world';
import { blob, trail, units } from '../tools/map/helpers';
import type { Rect } from '../tools/map/zone';
import layout from './world';

// The marsh: a sunken bog walled in by the wetlands, the jungle and the Frostlands. Two winding muddy causeways cross
// it (from the jungle in the west, and north-south from the wetlands to the Frostlands) and a little island holds a
// chest, with a troll on guard. Zombies and a troll: level 5-6.
// Squares x 28-31, y 7-9 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('marsh', to);
  return [g.col, g.row];
};
const [west, north, south] = [gap('jungle'), gap('wetlands'), gap('frostlands')];
const ISLAND = area(28.5, 7.4, 1.1, 0.7);
const DRY: Rect[] = [
  ...trail([west, [north[0], west[1]]], { swing: 1.5 }),
  ...trail([north, south], { swing: 1.5 }),
  ...blob(ISLAND, 5, 0.25),
  ...trail(
    [
      [ISLAND.col + 4, ISLAND.row + 4],
      [ISLAND.col + 4, west[1]],
    ],
    { swing: 0.5 },
  ), // the spit out to it
];
const KIT = { trees: ['swampTreeA', 'swampTreeB'], fillers: ['swampBush', 'rockSmall'] } as const;

export default defineBiome({
  name: 'marsh',
  climate: 'swamp',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.paint('mud', z.bounds);
    // The bog: everything inside the walls but the causeways and the island.
    const bog = new Set<number>();
    const { col, row, w, h } = z.bounds;
    const dry = (c: number, r: number) =>
      DRY.some((d) => c >= d.col && c < d.col + d.w && r >= d.row && r < d.row + d.h);
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) if (z.free(c, r) && !dry(c, r)) bog.add(r * 1000 + c);
    const isBog = (c: number, r: number) => bog.has(r * 1000 + c);
    for (const i of bog) {
      const cell = { col: i % 1000, row: Math.floor(i / 1000), w: 1, h: 1 };
      z.paint('bog', cell);
      z.block(cell, 'bog');
    }
    z.keepClear(DRY);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(30, 8.4));

    z.chest('oak', 'elixir', ...near(28.9, 7.6));
    z.mob('troll', ...near(29.1, 7.8));
    for (const [kind, x, y] of [
      ['zombie', 28.6, 8.4],
      ['zombie', 30.4, 7.4],
      ['zombie', 30.4, 9.4],
      ['zombie', 31.2, 8.4],
    ] as const)
      z.mob(kind, ...near(x, y));

    // Reeds are tall (4.5 cells): stand them where everything they cover is bog. Lily pads on open water.
    let reeds = 0;
    for (let r = row + h - 1; r >= row && reeds < 14; r -= 3) {
      for (let c = col; c < col + w - 2 && reeds < 14; c += 4) {
        let ok = true;
        for (let rr = r - 4; rr <= r && ok; rr++) for (let cc = c; cc < c + 3 && ok; cc++) ok = isBog(cc, rr);
        if (!ok || (c * 7 + r * 3) % 5 > 1) continue;
        z.prop(reeds % 3 ? 'reeds' : 'reedsThin', c, r);
        reeds++;
      }
    }
    const lilies = ['lilyPads', 'lilyFlower', 'lilyRed', 'lilyFlowerB'] as const;
    let n = 0;
    for (let r = row; r < row + h; r += 2)
      for (let c = col + (r % 3); c < col + w; c += 5)
        if (isBog(c, r) && (c + r) % 3 === 0) z.prop(lilies[n++ % 4], c, r);
  },
});
