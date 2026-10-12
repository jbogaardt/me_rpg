import { defineBiome, worldOf } from '../tools/map/world';
import { SWAMP_TREES } from '../tools/map/catalog';
import { blob, trail, units } from '../tools/map/helpers';
import { distanceField, fbm, maskRects, noise, smoothMask } from '../tools/map/noise';
import type { Rect } from '../tools/map/zone';
import layout from './world';

// The marsh: murky pools between mud banks, walled in by the wetlands, the jungle and the Frostlands. Two winding mud
// causeways cross it (from the jungle in the west, and north-south from the wetlands to the Frostlands) and a little
// island holds a chest, with a troll on guard. The pools are shaped by noise, so there are bays and points and the banks
// vary from one cell to three; reeds stand on the banks, lily pads float on the water. Zombies and a troll: level 5-6.
// Squares x 28-31, y 7-9 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('marsh', to);
  return [g.col, g.row];
};
const [west, north, south] = [gap('jungle'), gap('wetlands'), gap('frostlands')];
const ISLAND = area(28.5, 7.4, 1.1, 0.7);
/** The ground you can walk on across the pools: the causeways and the island with its spit. */
const DRY: Rect[] = [
  ...trail([west, [north[0], west[1]]], { swing: 1.5 }),
  ...trail([north, south], { swing: 1.5 }),
  ...blob(ISLAND, 5, 0.3),
  ...trail(
    [
      [ISLAND.col + 4, ISLAND.row + 4],
      [ISLAND.col + 4, west[1]],
    ],
    { swing: 0.5 },
  ), // the spit out to it
];
const KIT = { trees: [...SWAMP_TREES], fillers: ['swampBush', 'rockSmall'] } as const;

export default defineBiome({
  name: 'marsh',
  climate: 'swamp',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.ground('meadow', { inset: [2, 4] }); // marsh grass, darker inland, with the mud and the water laid over it
    z.ground('darkGrass', { inset: [4, 8] });

    // --- Pools: noise decides where the water is, the causeways where it is not ------------------------------------
    const b = z.bounds;
    const idx = (c: number, r: number) => (r - b.row) * b.w + (c - b.col);
    const inside = (c: number, r: number) => c >= b.col && r >= b.row && c < b.col + b.w && r < b.row + b.h;
    const dry = new Uint8Array(b.w * b.h);
    for (const r of DRY)
      for (let row = r.row; row < r.row + r.h; row++)
        for (let col = r.col; col < r.col + r.w; col++) if (inside(col, row)) dry[idx(col, row)] = 1;
    const away = distanceField(dry, b.w, b.h);
    const pools = fbm(5, 6);
    const bank = fbm(11, 5); // how wide the bank is round the causeways: one to three cells
    const ragged = noise(23, 2.4); // fine noise on the shore, so the edges of a pool are not straight runs
    let water: Uint8Array = new Uint8Array(b.w * b.h);
    for (let row = b.row; row < b.row + b.h; row++)
      for (let col = b.col; col < b.col + b.w; col++)
        if (z.free(col, row) && z.borderDistance(col, row) >= 4 + (bank(col, row) + 1))
          water[idx(col, row)] =
            pools(col, row) + 0.22 * ragged(col, row) > -0.18 &&
            away[idx(col, row)] > 1 + 1.6 * ((bank(col + 40, row) + 1) / 2)
              ? 1
              : 0;
    water = smoothMask(water, b.w, b.h, 1);
    // No land that the causeways cannot reach: a mud island you cannot step on would be an invisible wall.
    const seen = new Uint8Array(b.w * b.h);
    const stack: number[] = [];
    for (let i = 0; i < dry.length; i++)
      if (dry[i]) {
        seen[i] = 1;
        stack.push(i);
      }
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % b.w;
      for (const j of [c > 0 ? i - 1 : -1, c < b.w - 1 ? i + 1 : -1, i - b.w, i + b.w])
        if (j >= 0 && j < seen.length && !seen[j] && !water[j]) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    for (let i = 0; i < water.length; i++) {
      const col = b.col + (i % b.w),
        row = b.row + Math.floor(i / b.w);
      if (!water[i] && !seen[i] && z.free(col, row) && z.borderDistance(col, row) >= 4) water[i] = 1;
    }
    const isWater = (c: number, r: number) =>
      c >= b.col && r >= b.row && c < b.col + b.w && r < b.row + b.h && water[idx(c, r)] === 1;
    // Mud: the causeways, and a shore a cell or two wide round every pool, over the marsh grass.
    const waterMask = new Uint8Array(b.w * b.h);
    for (let i = 0; i < water.length; i++) waterMask[i] = water[i]!;
    const fromWater = distanceField(waterMask, b.w, b.h);
    const shore = fbm(17, 4);
    z.paint(
      'mud',
      maskRects(
        (c, r) =>
          z.owns(c, r) &&
          !isWater(c, r) &&
          (away[idx(c, r)] <= 0.5 || fromWater[idx(c, r)] <= 1.6 + 1.1 * ((shore(c, r) + 1) / 2)),
        b,
      ),
    );
    const pool = maskRects(isWater, b);
    z.paint('murk', pool);
    for (const r of pool) z.block(r, 'bog');
    z.keepClear(DRY);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(30, 8.4));
    z.pet('rat', ...near(31.2, 9.0));

    z.chest('oak', 'elixir', ...near(28.9, 7.6));
    z.mob('troll', ...near(29.1, 7.8));
    for (const [kind, x, y] of [
      ['zombie', 28.6, 8.4],
      ['zombie', 30.4, 7.4],
      ['zombie', 30.4, 9.4],
      ['zombie', 31.2, 8.4],
    ] as const)
      z.mob(kind, ...near(x, y));

    // --- Life: reeds on the banks (beside the water, never in it), lily pads where the water is open ----------------
    const land = (c: number, r: number) => z.free(c, r) && !isWater(c, r);
    let reeds = 0;
    const stood: [number, number][] = [];
    for (let row = b.row + 4; row < b.row + b.h - 2 && reeds < 26; row++)
      for (let col = b.col + 4; col < b.col + b.w - 4 && reeds < 26; col++) {
        if ((col * 7 + row * 13) % 5 !== 0) continue;
        if (stood.some(([c, r]) => Math.abs(c - col) < 6 && Math.abs(r - row) < 4)) continue;
        // On the bank, with the water on one side of the three cells the bed stands on.
        const east = land(col, row) && land(col + 1, row) && land(col + 2, row) && isWater(col + 3, row);
        const west = land(col, row) && land(col + 1, row) && land(col + 2, row) && isWater(col - 1, row);
        if (!east && !west) continue;
        // Never on or beside a causeway: a bed there narrows the way, and walking into it looks like being stuck in a bush.
        let clear = true;
        for (let dy = -3; dy <= 1; dy++)
          for (let dx = -1; dx <= 3; dx++) {
            const c = col + dx,
              r = row + dy;
            if (inside(c, r) && away[idx(c, r)] <= 2) clear = false;
          }
        if (!clear) continue;
        z.prop(reeds % 3 ? 'reedBed' : 'reedStalks', col, row);
        stood.push([col, row]);
        reeds++;
      }
    const lilies = ['lilyPads', 'lilyFlower', 'lilyRed', 'lilyFlowerB'] as const;
    let n = 0;
    for (let row = b.row; row < b.row + b.h; row += 2)
      for (let col = b.col + (row % 5); col < b.col + b.w; col += 6)
        if (isWater(col, row) && isWater(col + 1, row) && isWater(col, row + 1) && (col + row) % 3 === 0)
          z.prop(lilies[n++ % 4], col, row);
    z.scatter(['swampBush'], { count: 6, seed: 95 });
    z.scatter([...SWAMP_TREES], { count: 6, seed: 96, margin: 2 });
  },
});
