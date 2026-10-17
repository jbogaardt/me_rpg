import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { CRYPT_ARRIVAL, cryptExit } from '../tools/map/delves';

// The Barrow Deep: the crypt under the graveyard of the Barrow Lands, entered by the tomb at the back of the yard. A foyer
// under the stairs up, a long hall east past two crypts (one with a seep of black water), a winding way south to an ossuary,
// and the Pale Warden's seat. Painted by tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). Foes made for heroes of
// level 13 to 16 live here (public/content/campaign1/scenarios.json).
const W = 60;
const H = 50;

/** Where the scenario puts things: a chamber's centre. */
export const CRYPT = {
  foyer: [12, 9],
  hall: [32, 9],
  crypt1: [30, 24],
  crypt2: [47, 24],
  ossuary: [13, 40],
  seat: [46, 40],
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
    z.place('The Foyer of Names', 12, 9);
    z.place('The Ossuary', 13, 40);
    z.place("The Pale Warden's Seat", 46, 40);
  },
});
