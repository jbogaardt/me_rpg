import { defineBiome, worldOf } from '../tools/map/world';
import { FROST_TREES } from '../tools/map/catalog';
import { awayFrom, blob, trail, units } from '../tools/map/helpers';
import layout from './world';

// The Frostlands: the snowfields of the south-east. Frozen lakes, frosted groves, a ledge with a hoard, and a long
// snowy plain along the bottom of the world. Ways in: from the marsh (north), the Eastwood (west) and the town
// (south-west). Frostbound, trolls and skeletons: level 4-7, the hardest place so far.
// Squares x 28-33 at y 10-15, widening south to x 21-33 at y 21-22 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('frostlands', to);
  return [g.col, g.row];
};
const [marsh, east, town] = [gap('marsh'), gap('eastwood'), gap('town')];
const SPINE = marsh[0]; // the north-south trail's column
const TRAILS = [
  ...trail([marsh, [SPINE, town[1]]]), // down from the marsh
  ...trail([east, [SPINE, east[1]]]), // in from the Eastwood
  ...trail([town, [SPINE, town[1]]]), // in from the town
];

export default defineBiome({
  name: 'frostlands',
  climate: 'frost',
  walls: { trees: FROST_TREES, fillers: ['frostBush', 'frostRockSmall'] },
  build(z) {
    z.fill('snow');
    z.paint('snow', z.bounds);
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    z.sign(307, 134, { up: 'marsh', left: 'eastwood', down: 'town' }); // the fork (systems/signs.ts)
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(30.8, 14.2));
    z.pet('dog_white', ...near(32.0, 14.9));

    // --- Frozen lakes, slippery ---------------------------------------------------------------------------------
    for (const [x, y, w, h] of [
      [24.6, 17.6, 4, 2.2],
      [31, 11.2, 1.8, 1.2],
      [22.4, 21.2, 2, 0.9],
    ] as const) {
      z.paint('ice', blob(area(x, y, w, h)));
      z.keepClear(area(x - 0.2, y - 0.2, w + 0.4, h + 0.4));
    }

    // --- A ledge in the east with a hoard, guarded ------------------------------------------------------------
    z.plateau({ col: 315, row: 200, w: 9, h: 5 }, { kind: 'frost', stairs: [319] });
    z.prop('frostRockC', 322, 201);
    z.prop('frostBush', 316, 203);
    z.chest('silver', 'hoard', 317, 201);
    z.chest('silver', 'vikingHelm', 321, 203);
    z.chest('silver', 'backpack', 322, 203);
    z.mob('frostbound', 319, 202);

    for (const [x, y, w, h] of [
      [28.4, 10.6, 1.4, 1.4],
      [32, 13.4, 1.4, 1.6],
      [31.2, 17, 1.6, 1.2],
      [26, 20.2, 1.6, 1],
      [28.8, 21, 1.8, 1.2],
      [25.4, 16.2, 1.4, 0.8],
      [32.4, 19.6, 1.2, 1],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: FROST_TREES, fillers: ['frostBush', 'frostRockSmall'] });

    for (const [kind, x, y] of [
      ['frostbound', 29.4, 13],
      ['frostbound', 26.6, 17.2],
      ['frostWarden', 32.6, 12],
      ['troll', 31.6, 22],
      ['warg', 22.4, 22.4],
      ['frostbound', 33, 17],
      ['hexer', 24.6, 20.6],
      ['troll', 28, 19.4],
      ['frostbound', 30.4, 10.6],
      ['warg', 27.2, 22.2],
      ['frostWarden', 29.8, 16.6],
      ['snowman', 27.4, 14.6],
      ['snowman', 31.4, 20.4],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter([...FROST_TREES], { count: 55, where: open, seed: 41 });
    z.scatter(['frostBush'], { count: 18, where: open, seed: 42 });
    z.scatter(['frostRock', 'frostRockB', 'frostRockC', 'frostRockSmall'], { count: 45, where: open, seed: 43 });

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place('Mirrorfrost Lake', 266, 186);
    z.place('The Frozen Pond', 319, 119);
    z.place('The Frozen Ledge', 319, 202);

    // --- Wandering enemies: spread over the rest of the ground so no stretch is empty (never on top of the start) ---
    z.roam(['frostbound', 'warg', 'frostWarden', 'snowman', 'skeleton', 'troll', 'hexer', 'snowman'], {
      count: 10,
      seed: 109,
      avoid: [[...near(30.8, 14.2), 16]],
    });
  },
});
