import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { CRYPT_ARRIVAL, cryptExit } from '../tools/map/delves';

// The Barrow Deep: the crypt under the graveyard of the Barrow Lands, entered by the tomb at the back of the yard. A foyer
// under the stairs up, a long hall east past two crypts (one with a seep of black water), a winding way south to an ossuary,
// and the Pale Warden's seat. Past them: a long road east to the Hall of Kings (a shaft of crypts runs south to a
// reliquary), a bone pit in the south-west, and under the seat the Warden's Vigil, a wide arena with three ways in;
// foyer to crypt, crypt to the south road and the seat to the east shaft close loops. Painted by tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). Foes made for heroes of
// level 13 to 16 live here (public/content/campaign1/scenarios.json).
const W = 84;
const H = 70;

/** Where the scenario puts things: a chamber's centre. */
export const CRYPT = {
  foyer: [12, 9],
  hall: [32, 9],
  crypt1: [30, 24],
  crypt2: [47, 24],
  ossuary: [13, 40],
  seat: [46, 40],
  kings: [72, 14],
  reliquary: [72, 58],
  pit: [14, 62],
  vigil: [46, 62],
} as const;

export const crypt = new Delve(W, H);
crypt
  .ellipse(12, 9, 8, 5, '.', 0.3) // the foyer
  .rect(9, 5, 7, 4)
  .tunnel(
    [
      [19, 9],
      [47, 9],
    ],
    3,
  ) // the long hall
  .ellipse(32, 9, 6, 3, '.', 0.2) // a widening
  .ellipse(30, 24, 7, 5, '.', 0.3) // the first crypt
  .ellipse(47, 24, 7, 5, '.', 0.3) // the second crypt
  .tunnel(
    [
      [30, 10],
      [30, 19],
    ],
    3,
  )
  .tunnel(
    [
      [47, 10],
      [47, 19],
    ],
    3,
  )
  .tunnel(
    [
      [12, 14],
      [12, 28],
      [13, 34],
    ],
    3,
  )
  .ellipse(13, 40, 8, 5, '.', 0.3) // the ossuary
  .ellipse(46, 40, 11, 6, '.', 0.3) // the Pale Warden's seat
  .tunnel(
    [
      [20, 40],
      [36, 40],
    ],
    3,
  )
  .tunnel(
    [
      [47, 9],
      [66, 9],
    ],
    3,
  ) // the road east
  .ellipse(72, 14, 9, 7, '.', 0.3) // the Hall of Kings
  .tunnel(
    [
      [72, 20],
      [72, 52],
    ],
    3,
  ) // the shaft of crypts
  .tunnel(
    [
      [54, 24],
      [72, 24],
    ],
    3,
  ) // the second crypt to the shaft
  .ellipse(63, 31, 4, 3, '.', 0.2) // a side crypt
  .tunnel(
    [
      [63, 25],
      [63, 29],
    ],
    3,
  )
  .tunnel(
    [
      [57, 40],
      [72, 40],
    ],
    3,
  ) // the seat to the shaft
  .ellipse(72, 58, 9, 6, '.', 0.3) // the reliquary
  .ellipse(69, 59, 3, 2, '~')
  .tunnel(
    [
      [23, 24],
      [12, 24],
    ],
    3,
  ) // the first crypt to the foyer road
  .tunnel(
    [
      [30, 29],
      [30, 40],
    ],
    3,
  ) // the first crypt to the south road
  .tunnel(
    [
      [13, 45],
      [13, 57],
    ],
    3,
  )
  .ellipse(14, 62, 9, 5, '.', 0.3) // the bone pit
  .tunnel(
    [
      [22, 62],
      [34, 62],
    ],
    3,
  )
  .tunnel(
    [
      [46, 46],
      [46, 55],
    ],
    3,
  )
  .ellipse(46, 62, 14, 6, '.', 0.25) // the Warden's Vigil
  .ellipse(38, 62, 2, 1.5, '~')
  .ellipse(54, 62, 2, 1.5, '~')
  .ellipse(30, 25, 2, 1.5, '~'); // black water

const top = (col: number, from = 0) => {
  for (let row = from; row < H; row++) if (crypt.open(col, row)) return row;
  throw new Error(`column ${col} is all rock`);
};

export default defineZone({
  name: 'crypt_barrow',
  width: W,
  height: H,
  build(z) {
    crypt.paint(z, 'cave');
    const out = cryptExit();
    z.prop('caveExit', CRYPT_ARRIVAL.col - 1, top(CRYPT_ARRIVAL.col) - 1);
    z.door(CRYPT_ARRIVAL.col, top(CRYPT_ARRIVAL.col) - 1, 1, out.zone, out.col, out.row);
    z.spawn(CRYPT_ARRIVAL.col, CRYPT_ARRIVAL.row + 1);
    z.prop('caveHole', 31, top(32, 5) - 1);
    z.chest('iron', 'deephoard', ...crypt.firstOpen(44, 22, 4, 4));
    z.chest('wood', 'elixir', ...crypt.firstOpen(28, 22, 3, 3));
    z.chest('iron', 'wardenHelm', ...crypt.firstOpen(9, 38, 3, 3));
    z.chest('iron', 'deeprelic', ...crypt.firstOpen(51, 42, 3, 3));
    z.chest('iron', 'deephoard', ...crypt.firstOpen(77, 12, 3, 4)); // the Hall of Kings
    z.chest('wood', 'elixir', ...crypt.firstOpen(61, 29, 3, 3)); // the side crypt
    z.chest('iron', 'deeprelic', ...crypt.firstOpen(75, 58, 3, 3)); // the reliquary
    z.chest('iron', 'deephoard', ...crypt.firstOpen(8, 60, 3, 3)); // the bone pit
    z.chest('wood', 'elixir', ...crypt.firstOpen(52, 65, 3, 3)); // behind the Vigil
    z.place('The Foyer of Names', 12, 9);
    z.place('The Ossuary', 13, 40);
    z.place("The Pale Warden's Seat", 46, 40);
    z.place("The Warden's Vigil", 46, 62);
  },
});
