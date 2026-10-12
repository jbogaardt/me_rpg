import { defineBiome, worldOf } from '../tools/map/world';
import { JUNGLE_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pick, pond, reedsAt, trail, units } from '../tools/map/helpers';
import layout from './world';

// The jungle: a tall band of deep green in the middle of the north, from the sea down to the Eastwood. Thick groves,
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
const KIT = { trees: [...JUNGLE_TREES], fillers: ['jungleBush', 'rockSmall'] } as const;

export default defineBiome({
  name: 'jungle',
  climate: 'jungle',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.ground('meadow', { inset: [3, 6] }); // pale grass, then mid green, then the deep jungle: no bright halo at the edge
    z.ground('darkGrass', { inset: [6, 11] });
    z.paint('mud', [...TRAILS, ...blob(area(25, 9.6, 1.4, 0.6))]);
    z.keepClear(TRAILS);
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(24, 7.2));

    // --- A lagoon with reeds ----------------------------------------------------------------------------------
    const water = pond(z, area(24.6, 5.4, 2.2, 1.4), { shore: 'mud' });
    z.keepClear(area(24.3, 5.1, 2.8, 2));
    reedsAt(z, water, 9, 'w');
    z.prop('lilyFlower', pick(water, 3).col + 2, pick(water, 3).row);
    z.prop('lilyPads', pick(water, 6).col + 12, pick(water, 6).row);

    // --- Overgrown ruins with a chest ---------------------------------------------------------------------------
    for (const r of blob(area(25.4, 9.2, 1.2, 0.7), 3, 0.3)) z.fill('flagstone', r);
    z.paint('darkGrass', blob(area(25.4, 9.2, 1.2, 0.7), 3, 0.3), { erase: true });
    z.keepClear(area(25.2, 9, 1.6, 1.1));
    z.prop('menhir', ...at(25.5, 9.3));
    z.prop('menhir', ...at(26.4, 9.3));
    z.prop('rockB', ...at(25.6, 9.8));
    z.chest('oak', 'purse', ...near(26, 9.4));
    z.mob('troll', ...near(26, 9.7));

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

    for (const [kind, x, y] of [
      ['orc', 21.6, 1.6],
      ['orc', 25.4, 4.4],
      ['orc', 27, 9.4],
      ['wolfkin', 24, 6.4],
      ['wolfkin', 23.2, 9.6],
      ['goblin', 21.6, 4.2],
      ['goblin', 20.6, 2.4],
      ['troll', 26.8, 6.4],
      ['orc', 23.6, 2],
      ['wolfkin', 25.6, 8.2],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter([...JUNGLE_TREES], { count: 45, where: open, seed: 81 });
    z.scatter(['jungleBush'], { count: 20, where: open, seed: 82 });
    z.scatter(['rockB', 'rockC'], { count: 12, where: open, seed: 83 });
  },
});
