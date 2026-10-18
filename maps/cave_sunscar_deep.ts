import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { DEPTHS_ARRIVAL, hollowReturn } from '../tools/map/delves';

// The Sunscar Depths: the hollow's lowest level, a furnace under the desert. A narrow landing under the way back up, a
// long tunnel down to the Furnace Hall (a ring of floor round a lake of lava), a gallery of bones to the west with a
// hoard in its nook, a smelter's grotto to the north-west, and the Hollow King's seat in the south. Beyond them: a forge
// hall over lava in the east, a cinder pit, an ossuary, and (at the very bottom, three ways in) the Throne of Ash where
// Ashmaw sits. Loops: the landing to the grotto along the north, the gallery to the seat, the nook round the east. Painted by
// tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). Foes made for heroes of level 18 to 22 live here
// (public/content/campaign1/scenarios.json); the centres below are what the scenario places them by.
const W = 84;
const H = 74;

/** Where the scenario puts things: a chamber's centre. */
export const DEPTHS = {
  landing: [52, 9],
  hall: [30, 26],
  gallery: [9, 24],
  grotto: [10, 8],
  seat: [33, 44],
  nook: [57, 30],
  forge: [74, 14],
  pit: [74, 38],
  ossuary: [10, 56],
  throne: [33, 64],
  eastGuard: [70, 63],
} as const;

export const depths = new Delve(W, H);
depths
  .ellipse(52, 9, 7, 4, '.', 0.3) // the landing
  .rect(49, 5, 7, 3)
  .ellipse(30, 26, 19, 10, '.', 0.35) // the Furnace Hall
  .ellipse(9, 24, 6, 7, '.', 0.3) // the gallery of bones
  .ellipse(10, 8, 7, 4, '.', 0.3) // the smelter's grotto
  .ellipse(33, 44, 14, 5, '.', 0.3) // the Hollow King's seat
  .ellipse(57, 30, 4, 4, '.', 0.3) // the treasure nook
  .tunnel(
    [
      [52, 12],
      [52, 18],
      [43, 22],
    ],
    3,
  )
  .tunnel(
    [
      [12, 24],
      [14, 24],
    ],
    3,
  )
  .tunnel(
    [
      [10, 13],
      [10, 18],
    ],
    3,
  )
  .tunnel(
    [
      [33, 34],
      [33, 39],
    ],
    3,
  )
  .tunnel(
    [
      [49, 28],
      [54, 30],
    ],
    3,
  )
  .tunnel(
    [
      [17, 8],
      [45, 8],
    ],
    3,
  ) // the north road, grotto to landing
  .tunnel(
    [
      [58, 9],
      [68, 9],
    ],
    3,
  )
  .ellipse(74, 14, 8, 6, '.', 0.3) // the forge hall
  .ellipse(74, 14, 5, 3, '^')
  .rect(66, 13, 17, 2) // the causeway over its lava
  .tunnel(
    [
      [74, 20],
      [74, 30],
      [61, 30],
    ],
    3,
  )
  .ellipse(74, 38, 6, 5, '.', 0.3) // the cinder pit
  .tunnel(
    [
      [74, 43],
      [74, 62],
    ],
    3,
  )
  .ellipse(70, 63, 9, 5, '.', 0.3) // the east guard room
  .tunnel(
    [
      [61, 63],
      [49, 63],
    ],
    3,
  )
  .tunnel(
    [
      [9, 31],
      [9, 50],
    ],
    3,
  )
  .ellipse(10, 56, 8, 6, '.', 0.3) // the ossuary
  .tunnel(
    [
      [19, 44],
      [9, 44],
    ],
    3,
  ) // the seat to the gallery road
  .tunnel(
    [
      [33, 48],
      [33, 57],
    ],
    3,
  )
  .ellipse(33, 64, 16, 6, '.', 0.25) // the Throne of Ash
  .ellipse(24, 64, 3, 2, '^')
  .ellipse(42, 64, 3, 2, '^')
  .ellipse(30, 26, 10, 5, '^') // the lava lake
  .ellipse(9, 28, 2.5, 1.5, '~') // a seep in the gallery
  .rect(44, 33, 1, 1, '#') // two stray cells the hall's rim leaves
  .rect(40, 35, 1, 1, '#')
  .rect(49, 66, 1, 1, '#'); // and one the throne's rim leaves

/** The first floor row of column `col` at or below `from`. */
const top = (col: number, from = 0) => {
  for (let row = from; row < H; row++) if (depths.open(col, row)) return row;
  throw new Error(`column ${col} is all rock`);
};

export default defineZone({
  name: 'cave_sunscar_deep',
  width: W,
  height: H,
  build(z) {
    depths.paint(z, 'rock');
    // The way back up: a dark tunnel mouth in the landing's wall, a door on its middle cell.
    const out = hollowReturn();
    const doorRow = top(DEPTHS_ARRIVAL.col, 0) - 1;
    z.prop('caveHole', DEPTHS_ARRIVAL.col - 1, doorRow);
    z.door(DEPTHS_ARRIVAL.col, doorRow, 1, out.zone, out.col, out.row);
    z.spawn(DEPTHS_ARRIVAL.col, DEPTHS_ARRIVAL.row + 1);
    z.chest('iron', 'emberbrand', ...depths.firstOpen(55, 28, 4, 4));
    z.chest('iron', 'depthwalkers', ...depths.firstOpen(14, 28, 3, 3));
    z.chest('iron', 'ashmawHide', ...depths.firstOpen(8, 21, 3, 3));
    z.chest('wood', 'elixir', ...depths.firstOpen(9, 6, 3, 3));
    z.chest('iron', 'deephoard', ...depths.firstOpen(40, 42, 3, 3));
    z.chest('iron', 'deeprelic', ...depths.firstOpen(78, 12, 3, 4)); // the forge
    z.chest('wood', 'elixir', ...depths.firstOpen(71, 36, 4, 4));
    z.chest('iron', 'deephoard', ...depths.firstOpen(5, 54, 3, 3));
    z.chest('iron', 'deeprelic', ...depths.firstOpen(36, 66, 4, 3)); // behind the throne
    z.chest('wood', 'elixir', ...depths.firstOpen(66, 61, 4, 4));
    z.place('The Furnace Hall', 30, 26);
    z.place('The Gallery of Bones', 9, 24);
    z.place("The Hollow King's Seat", 33, 44);
    z.place('The Throne of Ash', 33, 64);
  },
});
