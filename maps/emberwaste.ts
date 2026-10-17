import { defineBiome, worldOf } from '../tools/map/world';
import { DEAD_TREES, type PrefabName } from '../tools/map/catalog';
import { awayFrom, blob, pond, trail, units } from '../tools/map/helpers';
import layout from './world';

// The Emberwaste: a burnt country east of the Mirewater, the first land past the old map. Ash and soot, red dirt tracks,
// lakes of lava, and at the crossing of its two roads the Cinder Ziggurat, a ruined temple-pyramid with a broken wall and
// statues round it. The ways in: from the wetlands (west) and out south to Rimeheart. Foes made for heroes of level 22 to
// 30 (public/content/campaign1/biomes.json banded roam groups, deepest in the east and north).
// Squares x 34-47 at y 0-9 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('emberwaste', to);
  return [g.col, g.row];
};
const [west, south] = [gap('wetlands'), gap('rimeheart')];
const CROSS: [number, number] = [south[0], west[1]]; // where the two roads meet
const TRAILS = [...trail([west, CROSS, south])];
const KIT = { trees: DEAD_TREES, fillers: ['deadBush', 'darkSpire'] } as const;

export default defineBiome({
  name: 'emberwaste',
  climate: 'undead',
  walls: { trees: [...KIT.trees], fillers: [...KIT.fillers] },
  build(z) {
    z.fill('grass');
    z.ground('ash', { inset: [1, 2] });
    z.paint('soot', [...blob(area(36, 1.5, 3, 2)), ...blob(area(43, 6.5, 3.4, 2)), ...blob(area(44.5, 1.8, 2.2, 1.6))]);
    z.paint('redDirt', [
      ...blob(area(40.4, 3.6, 2.2, 1.4)),
      ...blob(area(36.6, 8.2, 2, 1)),
      ...blob(area(46, 5.6, 1.6, 1.8)),
      ...blob(area(35.6, 3.8, 1.6, 1.2)),
    ]);
    z.paint('mud', TRAILS);
    z.keepClear(TRAILS);
    z.sign(west[0] + 10, west[1] - 3, { left: 'wetlands', down: 'rimeheart' }); // the first fork (systems/signs.ts)
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...z.near(west[0] + 8, west[1]));

    // --- Lakes of lava, shored with mud ----------------------------------------------------------------------
    for (const [x, y, w, h] of [
      [36.4, 5.6, 2.4, 1.4],
      [43.6, 3.4, 2.6, 1.6],
      [38.6, 7.6, 1.8, 1.0],
      [45.2, 7.9, 1.6, 1.0],
    ] as const) {
      pond(z, area(x, y, w, h), { water: 'lava', shore: 'mud' });
      z.keepClear(area(x - 0.3, y - 0.3, w + 0.6, h + 0.6));
    }

    // --- The Cinder Ziggurat, where the roads cross (art: LPC Jungle Ruins, ruins.png) ---------------------------
    z.keepClear({ col: CROSS[0] - 22, row: CROSS[1] - 30, w: 44, h: 32 });
    const ruin = (name: PrefabName, dx: number, dy: number) => z.prop(name, CROSS[0] + dx, CROSS[1] + dy);
    ruin('ruinPyramid', -8, -8);
    ruin('ruinPillar', -14, -6);
    ruin('ruinPillarBroken', 12, -6);
    ruin('ruinStatue', -4, -5);
    ruin('ruinStatueB', 4, -5);
    ruin('ruinWallBroken', -20, -14);
    ruin('ruinWall', 12, -16);
    ruin('ruinHut', 14, -3);
    ruin('ruinRubbleB', -10, -4);
    ruin('ruinRubbleD', 8, -4);
    ruin('ruinRubbleA', 0, -3);
    z.chest('silver', 'dreadHelm', CROSS[0] - 14, CROSS[1] - 2);
    z.chest('silver', 'deephoard', CROSS[0] + 15, CROSS[1] - 1);
    z.keepFree(CROSS[0] - 14, CROSS[1] - 1);
    z.keepFree(CROSS[0] + 15, CROSS[1]);
    z.place('The Cinder Ziggurat', CROSS[0], CROSS[1] - 10);

    // --- A camp of the fallen, north-east: iron crosses and a chest -------------------------------------------
    const camp = near(45.5, 1.4);
    z.keepClear({ col: camp[0] - 8, row: camp[1] - 3, w: 18, h: 9 });
    for (const [name, dx, dy] of [
      ['crossIronA', -5, 0],
      ['crossIronB', -2, 0],
      ['crossIronTall', 1, 0],
      ['crossIronA', 4, 0],
      ['crossBlack', -3, 3],
      ['crossIronB', 3, 3],
    ] as const)
      z.prop(name, camp[0] + dx, camp[1] + dy);
    z.chest('silver', 'runedPlate', camp[0], camp[1] + 3);
    z.keepFree(camp[0], camp[1] + 4);
    z.place('The Fallen Legion', camp[0], camp[1]);

    // --- Ruined watch-posts and pillars strewn along the road, and a chasm or two --------------------------------
    const post = (dx: number, dy: number) => {
      const [c, r] = near(dx, dy);
      z.keepClear({ col: c - 6, row: r - 6, w: 14, h: 10 });
      z.prop('ruinWallBroken', c - 3, r);
      z.prop('ruinPillar', c + 5, r - 1);
      z.prop('ruinPillarBroken', c - 6, r + 1);
      z.prop('ruinRubbleE', c + 1, r + 2);
      z.prop('ruinStatueB', c + 2, r - 2);
    };
    post(37.4, 2.4);
    post(44.4, 9.2);
    post(35.6, 6.4);
    pond(z, area(42.6, 6.6, 1.2, 0.8), { water: 'abyss' });
    pond(z, area(43, 8.7, 1.2, 0.6), { water: 'abyss' });
    z.keepClear([area(42.4, 6.4, 1.6, 1.2), area(42.8, 8.5, 1.6, 1)]);

    for (const [x, y, w, h] of [
      [35.2, 7.6, 1.2, 0.8],
      [40.6, 1.2, 1.4, 0.8],
      [42.4, 8.4, 1.2, 0.8],
      [46.4, 4.8, 1, 1.2],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: [...KIT.trees], fillers: [...KIT.fillers] });

    z.scatter([...DEAD_TREES], { count: 130, where: open, seed: 91 });
    z.scatter(['deadBush'], { count: 60, where: open, seed: 92 });
    z.scatter(['darkBoulder', 'darkBoulderB', 'darkSpire', 'menhir'], { count: 110, where: open, seed: 93 });

    z.place('The Mirewater Gate', west[0] + 12, west[1]);
    z.place('The Ember Lakes', ...near(44.4, 4.2));
    z.place('The Ashen Descent', south[0], south[1] - 12);
  },
});
