import { defineBiome, worldOf } from '../tools/map/world';
import { FROST_TREES, type PrefabName } from '../tools/map/catalog';
import { awayFrom, blob, trail, units } from '../tools/map/helpers';
import layout from './world';

// Rimeheart: the deep frost beyond the Frostlands, where the snow never thaws. Frozen lakes, groves of frosted pines, a
// plateau of old halls (the Wyrm's Rest) with a hoard under its walls, and a long white plain. The ways in: from the
// Frostlands (west) and the Emberwaste (north). Foes made for heroes of level 28 to 36 (public/content/campaign1/biomes.json,
// banded roam groups, deepest in the south-east). Squares x 34-47 at y 10-22 (maps/world.ts).

const W = worldOf(layout);
const { at, area } = units(layout.square);
const gap = (to: string): [number, number] => {
  const g = W.gap('rimeheart', to);
  return [g.col, g.row];
};
const [west, north] = [gap('frostlands'), gap('emberwaste')];
const CROSS: [number, number] = [north[0], west[1]];
const TRAILS = [...trail([west, CROSS]), ...trail([north, CROSS])];

export default defineBiome({
  name: 'rimeheart',
  climate: 'frost',
  walls: { trees: FROST_TREES, fillers: ['frostBush', 'frostRockSmall'] },
  build(z) {
    z.fill('snow');
    z.paint('snow', z.bounds);
    z.paint('dirt', TRAILS);
    z.keepClear(TRAILS);
    z.sign(west[0] + 10, west[1] - 3, { up: 'emberwaste', left: 'frostlands' });
    const open = awayFrom(TRAILS);
    const near = (x: number, y: number) => z.near(...at(x, y));
    z.spawn(...z.near(west[0] + 8, west[1]));

    // --- Frozen lakes, slippery -----------------------------------------------------------------------------------
    for (const [x, y, w, h] of [
      [36, 12.6, 4, 2.4],
      [43.4, 11.6, 3, 2],
      [37.4, 19.2, 3.4, 2],
      [44.6, 17.6, 2.6, 2.6],
    ] as const) {
      z.paint('ice', blob(area(x, y, w, h)));
      z.keepClear(area(x - 0.2, y - 0.2, w + 0.4, h + 0.4));
    }

    // --- The Wyrm's Rest: a plateau of old halls, a hoard under the walls (art: LPC Jungle Ruins, ruins.png) ---------
    const base = near(43, 14.6);
    z.keepClear({ col: base[0] - 6, row: base[1] - 12, w: 30, h: 22 });
    z.plateau({ col: base[0], row: base[1] - 8, w: 14, h: 6 }, { kind: 'frost', stairs: [base[0] + 6] });
    const ruin = (name: PrefabName, dx: number, dy: number) => z.prop(name, base[0] + dx, base[1] + dy);
    ruin('ruinHall', 2, -8);
    ruin('ruinPillar', 0, -7);
    ruin('ruinPillarBroken', 12, -7);
    ruin('ruinStatue', 6, -6);
    ruin('ruinRubbleC', 4, -3);
    z.chest('silver', 'starforgedBoots', base[0] + 3, base[1] - 5);
    z.chest('silver', 'starforgedShield', base[0] + 10, base[1] - 5);
    z.keepFree(base[0] + 6, base[1] - 1);
    z.place("The Wyrm's Rest", base[0] + 6, base[1] - 4);

    // --- A frozen battle: iron crosses on the white plain, with a hoard ------------------------------------------
    const field = near(38.4, 16.2);
    z.keepClear({ col: field[0] - 9, row: field[1] - 3, w: 20, h: 10 });
    for (const [name, dx, dy] of [
      ['crossIronA', -6, 0],
      ['crossIronB', -3, 0],
      ['crossIronA', 0, 0],
      ['crossIronB', 3, 0],
      ['crossIronTall', 6, 0],
      ['crossIronB', -4, 3],
      ['crossBlack', 1, 3],
      ['crossIronA', 5, 3],
    ] as const)
      z.prop(name, field[0] + dx, field[1] + dy);
    z.chest('silver', 'deephoard', field[0], field[1] + 3);
    z.keepFree(field[0], field[1] + 4);
    z.place('The Bitter Field', field[0], field[1] + 1);

    for (const [x, y, w, h] of [
      [35.2, 17, 1.4, 1.2],
      [40.4, 21.4, 1.8, 1],
      [46, 14.4, 1.2, 1.6],
      [42.2, 19.2, 1.4, 1],
      [36.6, 11.2, 1.4, 0.9],
    ] as const)
      z.grove(blob(area(x, y, w, h)), { trees: FROST_TREES, fillers: ['frostBush', 'frostRockSmall'] });

    z.scatter([...FROST_TREES], { count: 160, where: open, seed: 95 });
    z.scatter(['frostBush'], { count: 60, where: open, seed: 96 });
    z.scatter(['frostRock', 'frostRockB', 'frostRockC', 'frostRockSmall'], { count: 110, where: open, seed: 97 });

    z.place('The Whiteout Gate', west[0] + 12, west[1]);
    z.place('The Glass Lakes', ...near(37.2, 13.6));
    z.place('The Long White', ...near(40, 21));
  },
});
