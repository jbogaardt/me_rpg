import { defineBiome, worldOf } from '../tools/map/world';
import { DEAD_TREES } from '../tools/map/catalog';
import { awayFrom, blob, pond, trail, units } from '../tools/map/helpers';
import layout from './world';

// The undead lands: ash and dead trees north of the Greenwood. A graveyard of standing stones on cracked flags, black
// chasms, a pool of lava. Trails lead south to the Greenwood, north to the beach and east into the jungle.
// Skeletons, zombies and shades: level 3-4.
// Squares x 11-21 at y 6-10, plus x 18-21 at y 5 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('undead', to);
  return [g.col, g.row];
};
const [south, north, east] = [gap('greenwood'), gap('beach'), gap('jungle')];
const TRAILS = [
  ...trail([north, [north[0], east[1]], east]),
  ...trail([south, [south[0], east[1]], [north[0], east[1]]]),
];
const KIT = { trees: DEAD_TREES, fillers: ['deadBush', 'darkSpire'] } as const;

export default defineBiome({
  name: 'undead',
  climate: 'undead',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.ground('ash', { inset: [1, 2] }); // out under the walls: no ring of green grass inside them
    z.paint('soot', [...blob(area(11.4, 6.2, 2.6, 1.6)), ...blob(area(18, 8.8, 2.6, 1.4))]);
    z.paint('mud', TRAILS);
    z.keepClear(TRAILS);
    z.sign(194, 87, { up: 'beach', left: 'greenwood', right: 'jungle' }); // the fork (systems/signs.ts)
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...near(16, 9.2));
    z.pet('cat_black', ...near(17.2, 9.9));

    // --- The graveyard: rows of standing stones on trodden soot --------------------------------------------------
    const yard = blob(area(12, 8.1, 2.8, 1.6), 9, 0.25);
    z.paint('soot', yard); // trodden dark ground, soft-edged into the ash
    z.keepClear(area(11.8, 7.9, 3.2, 2));
    for (let c = 126; c <= 144; c += 3) for (const r of [85, 89, 93]) z.prop('menhir', c, r);
    z.chest('iron', 'legionHelm', ...near(12.4, 9.5));
    z.chest('wood', 'coins', ...near(14.6, 8.3));
    z.mob('skeleton', ...near(13.4, 8.8));
    z.mob('skeleton', ...near(14, 9.4));

    // --- Chasms and a lava pool ------------------------------------------------------------------------------
    pond(z, area(16, 6.3, 1.8, 1), { water: 'abyss' });
    pond(z, area(19.6, 9, 1, 0.8), { water: 'abyss' });
    pond(z, area(12.6, 6.4, 1.3, 0.8), { water: 'lava', shore: 'mud' });
    z.keepClear([area(15.8, 6.1, 2.2, 1.4), area(19.4, 8.8, 1.4, 1.2), area(12.3, 6.1, 1.9, 1.4)]);
    z.chest('iron', 'relic', ...near(20.4, 5.4));

    for (const [x, y, w, h] of [
      [11.4, 9.6, 1, 0.6],
      [17.2, 9.4, 1.2, 0.7],
      [20, 6.6, 0.8, 1],
      [14.4, 6.2, 0.9, 0.6],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: [...KIT.trees], fillers: [...KIT.fillers] });

    for (const [kind, x, y] of [
      ['skeleton', 15, 7.4],
      ['skeleton', 20.6, 7.2],
      ['skeleton', 18, 10],
      ['zombie', 11.6, 7.6],
      ['zombie', 17.4, 8.6],
      ['zombie', 15.2, 6.8],
      ['skeleton', 21, 8.6],
      ['zombie', 18.6, 6.4],
      ['zombie', 19.4, 5.6],
      ['skeleton', 13, 10.2],
      ['shade', 16.6, 10.2],
    ] as const)
      z.mob(kind, ...near(x, y));

    z.scatter([...DEAD_TREES], { count: 40, where: open, seed: 71 });
    z.scatter(['deadBush'], { count: 14, where: open, seed: 72 });
    z.scatter(['darkBoulder', 'darkBoulderB', 'darkSpire', 'menhir'], { count: 30, where: open, seed: 73 });

    // --- Names for the map: each shows once the player has explored round it ---------------------------------------
    z.place('The Graveyard', 130, 89);
    z.place('The Ember Pool', 130, 67);
    z.place('The Chasm', 168, 68);

    // --- Wandering enemies: spread over the rest of the ground so no stretch is empty (never on top of the start) ---
    z.roam(['skeleton', 'zombie', 'zombie', 'skeleton', 'shade'], {
      count: 10,
      seed: 105,
      avoid: [[...near(16, 9.2), 16]],
    });
  },
});
