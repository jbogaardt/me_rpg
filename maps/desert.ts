import { defineBiome, worldOf } from '../tools/map/world';
import { DRY_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
import layout from './world';

// The desert: the whole north-west, stepping down to the Greenwood. Dunes, a buried skull, red badlands, an oasis, a
// ring of standing rocks, and a mesa with the legion's lost gear. A trail runs from the Greenwood (south) to the beach
// (east). Dune raiders, orcs and the odd mummy: level 3-5.
// Squares x 0-13 at y 0-3, stepping down to x 0-2 at y 11 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('desert', to);
  return [g.col, g.row];
};
const [south, east] = [gap('greenwood'), gap('beach')];
const TRAILS = trail([south, [south[0], 62], [42, 62], [42, east[1]], east]);

export default defineBiome({
  name: 'desert',
  climate: 'desert',
  walls: { trees: DRY_TREES, fillers: ['sandBoulder', 'rockSmall'] },
  build(z) {
    z.fill('sand');
    z.paint('sand', z.bounds); // soft-edged sand over the fill, so the desert fades into its neighbours at the borders
    z.paint('redDirt', [
      ...blob(area(0.6, 0.6, 3.2, 2.2)),
      ...blob(area(9, 0.6, 3.4, 1.8)),
      ...blob(area(1, 7.2, 2.4, 1.8)),
    ]);
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(1.6, 10));
    z.pet('cat_tan', ...near(2.9, 10.6));

    // --- A mesa in the badlands with the legion's lost gear ---------------------------------------------------
    z.plateau({ col: 12, row: 8, w: 10, h: 5 }, { kind: 'dry', stairs: [16] });
    z.prop('dryBush', 19, 9);
    z.chest('iron', 'legionArmor', 20, 12);
    z.chest('iron', 'purse', 13, 12);
    z.chest('iron', 'parryingDagger', 13, 9);
    z.keepFree(17, 10);

    // --- An oasis --------------------------------------------------------------------------------------------
    const water = pond(z, area(6.8, 4.1, 2, 1.1), { shore: 'meadow' });
    z.keepClear(area(6.4, 3.7, 2.8, 1.9));
    z.prop('dryTreeA', ...near(6.6, 4));
    z.prop('dryTreeB', ...near(9, 5.2));
    reedsAt(z, water, 6, 'e');
    z.prop('lilyFlower', pick(water, 3).col + 3, pick(water, 3).row);
    z.prop('lilyPads', pick(water, 5).col + 10, pick(water, 5).row);
    z.chest('wood', 'potion', ...near(9.3, 4.4));

    // --- A ring of standing rocks ----------------------------------------------------------------------------
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 2;
      z.prop(i % 3 ? 'sandSpire' : 'sandBoulder', ...at(3.5 + Math.cos(t) * 0.6, 5 + Math.sin(t) * 0.45));
    }
    z.chest('oak', 'coins', ...near(3.5, 5));

    // --- Dunes, the skull, craters ---------------------------------------------------------------------------
    z.stamp('skull', 64, 6);
    z.stamp('dune', 110, 28);
    z.stamp('dune', 14, 40);
    z.stamp('dune', 60, 52);
    z.stamp('crater', 124, 10);
    z.stamp('crater', 30, 92);
    z.stamp('pit', 58, 48);
    z.stamp('pit', 104, 14);
    z.stamp('pit', 8, 64);
    z.keepClear([
      { col: 64, row: 6, w: 4, h: 5 },
      { col: 124, row: 10, w: 3, h: 3 },
      { col: 30, row: 92, w: 3, h: 3 },
    ]);
    for (const [x, y, w, h] of [
      [0.6, 3.4, 1.2, 0.8],
      [5, 2.6, 1.2, 0.7],
      [10.4, 3.4, 1.2, 0.8],
      [6.6, 5.6, 1.2, 0.6],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: DRY_TREES, fillers: ['sandBoulder', 'rockSmall'] });

    for (const [x, y] of [
      [5.6, 1.6],
      [10.6, 2.4],
      [2.6, 6.6],
      [11.6, 4.6],
      [8, 2.6],
      [2.6, 3.8],
      [8.4, 5.6],
      [1, 8.8],
      [3.6, 9.4],
      [12.6, 1.2],
      [6, 6.4],
    ] as const)
      z.keepFree(...near(x, y));

    // --- Hourglass sand: where the Great Hourglass's sand fell (the story quest "Sand and Silence", systems/quests.ts) ---
    for (const [x, y] of [
      [4.8, 1.8],
      [10.4, 2.2],
      [2.2, 3.8],
      [6, 8.2],
      [8.6, 6.2],
    ] as const)
      z.site('hoursand', ...near(x, y));

    z.scatter([...DRY_TREES], { count: 22, where: open, seed: 53 });
    z.scatter(['sandBoulder', 'sandBoulderB', 'sandSpire'], { count: 36, where: open, seed: 51 });
    z.scatter(['dryBush'], { count: 24, where: open, seed: 52 });
    z.scatter(['rockC', 'rockB', 'rockSmall'], { count: 30, where: open, seed: 54 });

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place("The Legion's Mesa", 17, 10);
    z.place('The Oasis', 78, 46);
    z.place('The Ring of Stones', 35, 50);
    z.place('The Buried Skull', 64, 6);
  },
});
