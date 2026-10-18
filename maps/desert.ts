import { defineBiome, worldOf } from '../tools/map/world';
import { DRY_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
import { CAVE_ARRIVAL, CAVE_MOUTH, DESERT_TEMPLE_DOOR } from '../tools/map/delves';
import { RUIN_ARRIVAL } from '../tools/map/ruinRooms';
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
    z.sign(45, 65, { down: 'greenwood', right: 'beach' }); // where the trail turns from south to east (systems/signs.ts)
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

    // --- A cave mouth in an outcrop of rock: the way down into the Sunscar Hollow (maps/cave_sunscar.ts) ---------------------
    z.keepClear([{ col: CAVE_MOUTH.col - 5, row: CAVE_MOUTH.row - 5, w: 12, h: 10 }]);
    z.prop('caveMouth', CAVE_MOUTH.col, CAVE_MOUTH.row);
    z.door(CAVE_MOUTH.col + 1, CAVE_MOUTH.row, 1, 'cave_sunscar', CAVE_ARRIVAL.col, CAVE_ARRIVAL.row);
    z.prop('sandBoulder', CAVE_MOUTH.col - 3, CAVE_MOUTH.row);
    z.prop('sandBoulderB', CAVE_MOUTH.col + 2, CAVE_MOUTH.row);
    z.prop('sandSpire', CAVE_MOUTH.col - 1, CAVE_MOUTH.row - 2);
    z.prop('sandSpire', CAVE_MOUTH.col + 4, CAVE_MOUTH.row - 1);
    z.keepFree(CAVE_MOUTH.col + 1, CAVE_MOUTH.row + 1);
    z.place('The Sunscar Hollow', CAVE_MOUTH.col + 1, CAVE_MOUTH.row + 3);

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

    // --- A half-buried temple, a fallen wall and a gate on the trail (art: LPC Jungle Ruins, ruins.png) ---------------
    z.keepClear([{ col: 93, row: 29, w: 15, h: 14 }]);
    z.prop('ruinTemple', 96, 40);
    z.door(
      DESERT_TEMPLE_DOOR.col,
      DESERT_TEMPLE_DOOR.row,
      DESERT_TEMPLE_DOOR.w,
      'ruin_temple_desert',
      RUIN_ARRIVAL.col,
      RUIN_ARRIVAL.row + 1,
    ); // its arch leads in (maps/ruin_temple_desert.ts)
    z.prop('ruinStatue', 94, 41);
    z.prop('ruinStatueB', 105, 41);
    z.prop('ruinRubbleB', 99, 42);
    z.prop('ruinWallBroken', 54, 38);
    z.prop('ruinPillarBroken', 53, 39);
    z.prop('ruinPillar', 62, 39);
    z.prop('ruinRubbleA', 58, 40);
    z.prop('ruinArch', 42, 46);

    z.chest('iron', 'topaz', ...z.near(100, 44)); // behind the temple, in the sand
    // A ruined watch post on the western plain: a fallen wall, a snapped pillar and a hut with its roof gone.
    z.keepClear([{ col: 14, row: 50, w: 24, h: 10 }]);
    z.prop('ruinWallBroken', 18, 57);
    z.prop('ruinPillarBroken', 17, 58);
    z.prop('ruinHut', 27, 58);
    z.prop('ruinRubbleC', 25, 58);
    z.prop('ruinRubbleF', 32, 57);
    z.place('The Watch Post', 24, 55);

    z.giver('zahra', ...z.near(80, 49)); // the sandwalker at the oasis (quests.json `givers`)

    z.scatter([...DRY_TREES], { count: 22, where: open, seed: 53 });
    z.scatter(['sandBoulder', 'sandBoulderB', 'sandSpire'], { count: 36, where: open, seed: 51 });
    z.scatter(['dryBush'], { count: 24, where: open, seed: 52 });
    z.scatter(['rockC', 'rockB', 'rockSmall'], { count: 30, where: open, seed: 54 });

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place("The Legion's Mesa", 17, 10);
    z.place('The Sandbound Temple', 100, 36);
    z.place('The Oasis', 78, 46);
    z.place('The Ring of Stones', 35, 50);
    z.place('The Buried Skull', 64, 6);
  },
});
