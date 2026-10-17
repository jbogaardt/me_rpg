import { defineBiome, worldOf } from '../tools/map/world';
import { SWAMP_TREES, type PrefabName } from '../tools/map/catalog';
import { awayFrom, blob, pond, reedsAt, trail, units } from '../tools/map/helpers';
import { camp } from '../tools/map/camp';
import layout from './world';

// The Drowned Moor: a flooded country east of Rimeheart where a kingdom sank and left its towers standing in the water.
// Black pools between mud banks, reeds, sunken walls and a drowned throne hall at the crossing of the roads. Ways in: from
// Rimeheart (west) and the Glasswastes (north). Foes made for heroes of level 40 to 48 (public/content/campaign1/biomes.json
// banded roam groups, deepest in the south-east). Squares x 48-61 at y 10-22 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('drownedmoor', to);
  return [g.col, g.row];
};
const [west, north] = [gap('rimeheart'), gap('glasswastes')];
const CROSS: [number, number] = [north[0], west[1]];
const TRAILS = [...trail([west, CROSS]), ...trail([north, CROSS])];
const KIT = { trees: [...SWAMP_TREES], fillers: ['swampBush', 'rockSmall'] } as const;

export default defineBiome({
  name: 'drownedmoor',
  climate: 'swamp',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.ground('mud', { inset: [1, 2] });
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    z.sign(west[0] + 10, west[1] - 3, { up: 'glasswastes', left: 'rimeheart' });
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...z.near(west[0] + 8, west[1]));

    // --- A wayfarers' camp by the western gate -------------------------------------------------------------------
    camp(z, ...near(49.6, 11.4), 'campMoor', 'The Moor Camp');

    // --- Black pools, with reeds on their banks ---------------------------------------------------------------------
    for (const [i, [x, y, w, h]] of (
      [
        [50, 12.4, 3, 1.8],
        [56.4, 11.6, 3.2, 1.8],
        [50.6, 18.6, 3.4, 2],
        [57.4, 17.4, 3, 2.4],
        [53.6, 20.8, 2.4, 1.2],
        [59, 14.4, 1.6, 1],
        [52.6, 14.8, 1.4, 1],
      ] as const
    ).entries()) {
      const water = pond(z, area(x, y, w, h), { water: i % 2 ? 'pond' : 'murk', shore: 'mud' });
      z.keepClear(area(x - 0.3, y - 0.3, w + 0.6, h + 0.6));
      if (i % 3 === 0) reedsAt(z, water, 2, 'e');
    }

    // --- The drowned throne hall, where the roads cross (art: LPC Jungle Ruins, ruins.png) ------------------------------
    z.keepClear({ col: CROSS[0] - 20, row: CROSS[1] - 26, w: 42, h: 28 });
    const ruin = (name: PrefabName, dx: number, dy: number) => z.prop(name, CROSS[0] + dx, CROSS[1] + dy);
    ruin('ruinHall', -5, -8);
    ruin('ruinTemple', 8, -12);
    ruin('ruinWallBroken', -18, -10);
    ruin('ruinPillar', -7, -6);
    ruin('ruinPillarBroken', 6, -6);
    ruin('ruinStatue', -2, -5);
    ruin('ruinRubbleB', 3, -3);
    ruin('ruinHut', -16, -3);
    z.chest('silver', 'worldforgedBoots', CROSS[0] - 14, CROSS[1] - 2);
    z.chest('silver', 'deephoard', CROSS[0] + 15, CROSS[1] - 2);
    z.keepFree(CROSS[0] - 14, CROSS[1] - 1);
    z.keepFree(CROSS[0] + 15, CROSS[1] - 1);
    z.place('The Drowned Throne', CROSS[0], CROSS[1] - 7);

    // --- A sunken tower stump out in the water with the best of the hoard ---------------------------------------------
    const stump = near(57, 19.4);
    z.keepClear({ col: stump[0] - 6, row: stump[1] - 8, w: 13, h: 12 });
    z.prop('ruinWall', stump[0] - 4, stump[1]);
    z.prop('ruinPillar', stump[0] - 6, stump[1] + 1);
    z.prop('ruinPillarBroken', stump[0] + 5, stump[1] + 1);
    z.prop('ruinStatueB', stump[0], stump[1] - 2);
    z.chest('silver', 'worldforgedSword', stump[0], stump[1] + 3);
    z.keepFree(stump[0], stump[1] + 4);
    z.place('The Sunken Spire', stump[0], stump[1]);

    for (const [x, y, w, h] of [
      [48.6, 15.8, 1.2, 1.4],
      [55.2, 13.4, 1.4, 1],
      [60.2, 20.4, 1.2, 1.4],
      [49.6, 21.4, 1.6, 1],
      [55.4, 16.2, 1.4, 1.2],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: [...KIT.trees], fillers: [...KIT.fillers] });

    z.scatter([...SWAMP_TREES], { count: 100, where: open, seed: 105 });
    z.scatter(['swampBush'], { count: 60, where: open, seed: 106 });
    z.scatter(['rock', 'rockB', 'rockSmall'], { count: 50, where: open, seed: 107 });

    z.place('The Rimeheart Gate', west[0] + 12, west[1]);
    z.place('The Black Pools', ...near(51.6, 13.4));
    z.place('The Far Shore', ...near(60, 21));
  },
});
