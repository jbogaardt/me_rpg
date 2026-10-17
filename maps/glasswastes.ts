import { defineBiome, worldOf } from '../tools/map/world';
import { DRY_TREES, type PrefabName } from '../tools/map/catalog';
import { awayFrom, blob, trail, units } from '../tools/map/helpers';
import layout from './world';

// The Glasswastes: a salt-white desert east of the Emberwaste where old fire fused the sand to glass. Pale dunes, craters
// and bleached skulls, a ruined citadel where the roads cross, and a road that runs on to the Drowned Moor. Foes made for
// heroes of level 34 to 42 (public/content/campaign1/biomes.json banded roam groups, deepest in the north-east).
// Squares x 48-61 at y 0-9 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('glasswastes', to);
  return [g.col, g.row];
};
const [west, south] = [gap('emberwaste'), gap('drownedmoor')];
const CROSS: [number, number] = [south[0], west[1]];
const TRAILS = [...trail([west, CROSS, south])];

export default defineBiome({
  name: 'glasswastes',
  climate: 'desert',
  walls: { trees: DRY_TREES, fillers: ['sandBoulder', 'rockSmall'] },
  build(z) {
    z.fill('sand');
    z.paint('sand', z.bounds);
    z.paint('redDirt', [
      ...blob(area(50, 1.2, 2.6, 1.8)),
      ...blob(area(57, 6.6, 3, 2)),
      ...blob(area(55.4, 1.6, 2.2, 1.4)),
    ]);
    z.paint('ash', [...blob(area(51, 6.4, 2.4, 1.6)), ...blob(area(59, 1.6, 2, 1.8))]);
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    z.sign(west[0] + 10, west[1] - 3, { left: 'emberwaste', down: 'drownedmoor' });
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...z.near(west[0] + 8, west[1]));

    // --- Craters, dunes and bleached skulls, where the fire fell -------------------------------------------------
    for (const [name, x, y] of [
      ['crater', 50.6, 3.6],
      ['crater', 58.2, 4.2],
      ['crater', 53, 8],
      ['dune', 56, 2],
      ['dune', 50.4, 5.8],
      ['dune', 60, 8],
      ['dune', 52.4, 1.2],
      ['skull', 54.2, 6.8],
      ['skull', 59.4, 3],
      ['skull', 51.6, 4.6],
    ] as const) {
      const [c, r] = near(x, y);
      z.keepClear({ col: c - 4, row: r - 4, w: 10, h: 9 });
      z.stamp(name, c, r);
    }

    // --- The Glass Citadel, where the roads cross (art: LPC Jungle Ruins, ruins.png) ---------------------------------
    z.keepClear({ col: CROSS[0] - 22, row: CROSS[1] - 26, w: 44, h: 28 });
    const ruin = (name: PrefabName, dx: number, dy: number) => z.prop(name, CROSS[0] + dx, CROSS[1] + dy);
    ruin('ruinTemple', -4, -6);
    ruin('ruinHall', -18, -8);
    ruin('ruinWall', 8, -10);
    ruin('ruinArch', -10, 1);
    ruin('ruinPillar', -9, -5);
    ruin('ruinPillar', 7, -5);
    ruin('ruinStatue', -6, -4);
    ruin('ruinStatueB', 5, -4);
    ruin('ruinRubbleA', -2, -2);
    ruin('ruinRubbleF', 11, -3);
    z.chest('silver', 'eclipseHelm', CROSS[0] - 16, CROSS[1] - 2);
    z.chest('silver', 'deephoard', CROSS[0] + 14, CROSS[1] - 2);
    z.keepFree(CROSS[0] - 16, CROSS[1] - 1);
    z.keepFree(CROSS[0] + 14, CROSS[1] - 1);
    z.place('The Glass Citadel', CROSS[0], CROSS[1] - 8);

    // --- A buried caravan: a ring of pillars and a hoard ---------------------------------------------------------
    const ring = near(58.6, 8);
    z.keepClear({ col: ring[0] - 7, row: ring[1] - 6, w: 15, h: 12 });
    for (const [dx, dy] of [
      [-5, -3],
      [5, -3],
      [-5, 3],
      [5, 3],
      [0, -5],
    ] as const)
      z.prop('ruinPillarBroken', ring[0] + dx, ring[1] + dy);
    z.chest('silver', 'eclipsePlate', ring[0], ring[1]);
    z.keepFree(ring[0], ring[1] + 1);
    z.place('The Buried Caravan', ring[0], ring[1]);

    z.scatter([...DRY_TREES], { count: 70, where: open, seed: 101 });
    z.scatter(['dryBush'], { count: 60, where: open, seed: 102 });
    z.scatter(['sandBoulder', 'sandBoulderB', 'sandSpire', 'rock', 'rockB'], { count: 110, where: open, seed: 103 });

    z.place('The Ember Gate', west[0] + 12, west[1]);
    z.place('The Salt Flats', ...near(52.4, 4));
    z.place('The Moor Road', south[0], south[1] - 12);
  },
});
