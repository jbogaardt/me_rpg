import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { CAVE_ARRIVAL, caveExit } from '../tools/map/delves';

// The Sunscar Hollow: a cave under the desert's rocks, entered by the cave mouth in the dunes (tools/map/delves.ts). A foyer under
// a shaft of daylight (the way out), a hall to the east, a great cavern with a lake of lava, a pool in the south-west, and
// two dead ends with treasure. Painted by tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). Goblins, wolfkin and
// worse live here (public/content/campaign1/scenarios.json).
const W = 56;
const H = 44;

const cave = new Delve(W, H);
cave
  .ellipse(14, 10, 9, 5, '.', 0.3) // the foyer
  .rect(11, 5, 7, 4) // flat floor under the exit
  .ellipse(38, 9, 8, 5, '.', 0.3) // the east hall
  .ellipse(30, 28, 14, 9, '.', 0.35) // the great cavern
  .ellipse(9, 35, 7, 6, '.', 0.3) // the south-west grotto
  .ellipse(48, 18, 6, 5, '.', 0.3) // the treasure nook
  .ellipse(47, 37, 6, 4, '.', 0.3) // the deep chamber
  .tunnel(
    [
      [22, 9],
      [32, 9],
    ],
    3,
  )
  .tunnel(
    [
      [14, 15],
      [14, 24],
      [20, 24],
    ],
    3,
  )
  .tunnel(
    [
      [17, 31],
      [11, 31],
    ],
    3,
  )
  .tunnel(
    [
      [44, 10],
      [48, 10],
      [48, 14],
    ],
    3,
  )
  .tunnel(
    [
      [42, 26],
      [48, 26],
      [48, 22],
    ],
    3,
  )
  .tunnel(
    [
      [40, 32],
      [40, 37],
      [43, 37],
    ],
    3,
  )
  .ellipse(31, 29, 5, 3, '^') // the lava lake
  .ellipse(9, 36, 3, 2, '~') // the grotto's pool
  .ellipse(38, 12, 2.5, 1.5, '~'); // a pool in the east hall

/** The first floor row of column `col` at or below `from` (where the wall's face above it ends). */
const top = (col: number, from = 0) => {
  for (let row = from; row < H; row++) if (cave.open(col, row)) return row;
  throw new Error(`column ${col} is all rock`);
};

export default defineZone({
  name: 'cave_sunscar',
  width: W,
  height: H,
  build(z) {
    cave.paint(z, 'cave');
    // The way out: the daylight over the foyer, a door on its bottom row (the middle cell).
    z.prop('caveExit', 13, top(14) - 1);
    const out = caveExit();
    z.door(14, top(14) - 1, 1, out.zone, out.col, out.row);
    z.spawn(CAVE_ARRIVAL.col, CAVE_ARRIVAL.row + 1);
    z.prop('caveHole', 46, top(47, 30) - 1); // a deeper tunnel in the far chamber's wall
    z.chest('iron', 'hoard', ...cave.firstOpen(46, 17, 5, 3));
    z.chest('wood', 'elixir', ...cave.firstOpen(5, 31, 3, 3));
    z.chest('iron', 'relic', ...cave.firstOpen(48, 38, 3, 3));
    z.place('The Sunscar Hollow', 30, 22);
  },
});
