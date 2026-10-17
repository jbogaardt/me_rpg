import { defineBiome, worldOf } from '../tools/map/world';
import { JUNGLE_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
import layout from './world';

// The jungle: a tall band of jungle trees in the middle of the north, from the sea down to the Eastwood. Thick groves,
// muddy trails, a lagoon with reeds, overgrown ruins. Every neighbour has a way in: the beach, the wetlands, the undead
// lands, the marsh and the Eastwood. Orcs, trolls, wolfkin and goblins: level 4-6.
// Squares x 20-23 at y 0-3, x 21-26 at y 4, x 22-27 at y 5-10 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('jungle', to);
  return [g.col, g.row];
};
const [beach, wet, undead, marsh, south] = [
  gap('beach'),
  gap('wetlands'),
  gap('undead'),
  gap('marsh'),
  gap('eastwood'),
];
const TRAILS = [
  ...trail([beach, wet]), // the coast road, beach to wetlands
  ...trail([
    [216, beach[1]],
    [216, 44],
    [234, 44],
    [234, undead[1]],
  ]), // south through the jungle
  ...trail([undead, marsh]), // undead lands to the marsh
  ...trail([[south[0], undead[1]], south]), // down to the Eastwood
];
const L = (col: number, row: number): [number, number] => [col + 175, row]; // a cell of the jungle's own map, in world cells
const KIT = { trees: [...JUNGLE_TREES], fillers: ['jungleBush', 'rockSmall'] } as const;

export default defineBiome({
  name: 'jungle',
  climate: 'jungle',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.paint('mud', TRAILS);
    z.keepClear(TRAILS);

    // --- Signposts at the forks (systems/signs.ts) ------------------------------------------------------------------
    z.sign(217, 20, { left: 'beach', right: 'wetlands', down: 'eastwood' });
    z.sign(235, 87, { up: 'beach', left: 'undead', right: 'marsh' });
    z.sign(244, 80, { left: 'undead', right: 'marsh', down: 'eastwood' });
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(24, 7.2));
    z.pet('rat', ...near(25.2, 7.8));

    // --- A lagoon with reeds ----------------------------------------------------------------------------------
    const water = pond(z, area(24.6, 5.4, 2.2, 1.4), { shore: 'mud' });
    z.keepClear(area(24.3, 5.1, 2.8, 2));
    reedsAt(z, water, 9, 'w');
    z.prop('lilyFlower', pick(water, 3).col + 2, pick(water, 3).row);
    z.prop('lilyPads', pick(water, 6).col + 12, pick(water, 6).row);

    // --- Overgrown ruins with a chest ---------------------------------------------------------------------------
    z.patch('stone', area(25.4, 9.2, 1.2, 0.7)); // old flags, with the tileset's own grassy edge
    z.keepClear(area(25.2, 9, 1.6, 1.1));
    z.prop('ruinPillar', ...at(25.5, 9.3));
    z.prop('ruinPillar', ...at(26.4, 9.3));
    z.prop('rockB', ...at(25.6, 9.8));
    z.prop('ruinWallBroken', ...L(81, 91)); // the fallen north wall of the old court, behind the chest
    z.prop('ruinStatue', ...L(82, 95));
    z.prop('ruinStatueB', ...L(88, 95));
    z.prop('ruinRubbleA', ...L(79, 98));
    z.prop('ruinRubbleC', ...L(91, 96));
    z.prop('ruinRubbleE', ...L(84, 99));
    z.chest('oak', 'purse', ...near(26, 9.4));
    z.keepFree(...near(26, 9.7));

    // --- The Sunken City (art: LPC Jungle Ruins, ruins.png): a pyramid and a temple on the north plain, facing the
    // coast road, and an outpost in the strip between the two southern trails ----------------------------------------
    z.keepClear([
      { col: 175 + 43, row: 3, w: 19, h: 17 },
      { col: 175 + 30, row: 4, w: 11, h: 11 },
    ]); // no scattered trees across the pyramid and the temple
    z.prop('ruinPyramid', ...L(44, 18));
    z.prop('ruinTemple', ...L(32, 14));
    z.prop('ruinRubbleB', ...L(48, 19));
    z.prop('ruinRubbleF', ...L(57, 19));
    z.prop('ruinPillarBroken', ...L(41, 19));
    z.prop('ruinPillar', ...L(30, 15));
    z.prop('ruinHall', ...L(47, 66));
    z.prop('ruinHut', ...L(48, 74));
    z.prop('ruinStatueB', ...L(54, 72));
    z.prop('ruinRubbleD', ...L(55, 69));
    z.prop('ruinPillarBroken', ...L(56, 76));
    z.prop('ruinArch', ...L(41, 36)); // a gate over the trail south
    z.prop('ruinWall', ...L(74, 49)); // a long wall with carved faces on the plain north of the lagoon
    z.prop('ruinPillar', ...L(72, 49));
    z.prop('ruinPillarBroken', ...L(86, 49));
    z.prop('ruinRubbleA', ...L(77, 50));
    z.prop('ruinRubbleF', ...L(84, 50));
    z.prop('ruinHut', ...L(90, 50));

    for (const [x, y, w, h] of [
      [20.4, 0.6, 1.2, 1.6],
      [22.2, 0.8, 1.2, 1.2],
      [22.6, 3.2, 1.2, 0.9],
      [26, 4.6, 0.9, 0.6],
      [22.4, 5.6, 1.4, 1.6],
      [22.4, 9, 1.4, 1],
      [26.8, 7, 1, 1],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: [...KIT.trees], fillers: [...KIT.fillers] });
    z.chest('wood', 'potion', ...near(20.6, 3.2));

    for (const [x, y] of [
      [21.6, 1.6],
      [25.4, 4.4],
      [27, 9.4],
      [24, 6.4],
      [23.2, 9.6],
      [21.6, 4.2],
      [20.6, 2.4],
      [26.8, 6.4],
      [23.6, 2],
      [25.6, 8.2],
    ] as const)
      z.keepFree(...near(x, y));

    z.scatter([...JUNGLE_TREES], { count: 45, where: open, seed: 81 });
    z.scatter(['jungleBush'], { count: 20, where: open, seed: 82 });
    z.scatter(['rockB', 'rockC'], { count: 12, where: open, seed: 83 });

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place('The Lagoon', 257, 64);
    z.place('Overgrown Ruins', 260, 94);
  },
});
