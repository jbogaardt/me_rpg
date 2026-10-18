import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { UNDERCROFT_ARRIVAL, undercroftReturn } from '../tools/map/delves';

// The Lanternrest Undercroft: the vaults the town was built over, older than its sewers. An entry hall under the stairs
// up, a colonnade down to the Drowned Cistern (a pool ringed with floor), a chapel to the west and a store-vault to the
// east, and the Cistern King's chamber in the south. Round them: a scribes' crypt and an armoury off the entry hall (so
// the chapel and the store-vault can be reached from above or below), a flooded gallery in the far east, two storerooms
// in the south corners, and below the court the Drowned Throne itself, a pool ringed with floor. Painted by tools/map/delve.ts (art by MrBeast, art/oga_dungeon/).
// Foes made for heroes of level 9 to 11 live here (public/content/campaign1/scenarios.json).
const W = 70;
const H = 62;

/** Where the scenario puts things: a chamber's centre. */
export const UNDERCROFT = {
  entry: [26, 7],
  cistern: [26, 22],
  scribes: [9, 6],
  armoury: [45, 6],
  gallery: [62, 22],
  westStore: [7, 46],
  eastStore: [49, 46],
  throne: [26, 52],
  chapel: [6, 22],
  vault: [46, 22],
  court: [26, 34],
} as const;

export const undercroft = new Delve(W, H);
undercroft
  .rect(22, 4, 9, 6) // the entry hall
  .tunnel(
    [
      [26, 9],
      [26, 17],
    ],
    3,
  )
  .rect(14, 17, 25, 11) // the Drowned Cistern
  .rect(21, 20, 11, 5, '~')
  .tunnel(
    [
      [14, 22],
      [9, 22],
    ],
    3,
  )
  .rect(3, 17, 7, 11) // the chapel
  .tunnel(
    [
      [39, 22],
      [43, 22],
    ],
    3,
  )
  .rect(42, 17, 8, 11) // the store-vault
  .tunnel(
    [
      [26, 27],
      [26, 31],
    ],
    3,
  )
  .rect(12, 31, 29, 8) // the Cistern King's court, now the throne's antechamber
  .tunnel(
    [
      [26, 38],
      [26, 44],
    ],
    3,
  )
  .rect(14, 44, 25, 13) // the Drowned Throne
  .rect(20, 47, 13, 6, '~')
  .tunnel(
    [
      [6, 27],
      [6, 41],
    ],
    3,
  )
  .rect(3, 40, 8, 12) // the west storeroom
  .tunnel(
    [
      [10, 50],
      [14, 50],
    ],
    3,
  )
  .tunnel(
    [
      [45, 27],
      [45, 41],
    ],
    3,
  )
  .rect(42, 40, 10, 12) // the east storeroom
  .tunnel(
    [
      [39, 50],
      [42, 50],
    ],
    3,
  )
  .rect(3, 3, 12, 7) // the scribes' crypt
  .tunnel(
    [
      [6, 9],
      [6, 17],
    ],
    3,
  )
  .tunnel(
    [
      [14, 6],
      [22, 6],
    ],
    3,
  )
  .rect(37, 3, 12, 7) // the armoury
  .tunnel(
    [
      [31, 6],
      [37, 6],
    ],
    3,
  )
  .tunnel(
    [
      [45, 9],
      [45, 17],
    ],
    3,
  )
  .tunnel(
    [
      [50, 22],
      [56, 22],
    ],
    3,
  )
  .rect(56, 14, 12, 16) // the flooded gallery
  .rect(59, 18, 6, 8, '~');

export default defineZone({
  name: 'sewer_undercroft',
  width: W,
  height: H,
  build(z) {
    undercroft.paint(z, 'sewer');
    const out = undercroftReturn();
    z.prop('sewerDoor', 26, 3);
    z.door(26, 3, 1, out.zone, out.col, out.row);
    z.spawn(UNDERCROFT_ARRIVAL.col, UNDERCROFT_ARRIVAL.row + 2);
    for (const [col, row] of [
      [23, 3],
      [29, 3],
      [20, 16],
      [32, 16],
      [5, 16],
      [45, 16],
      [18, 30],
      [34, 30],
    ] as const)
      z.prop('sewerTorch', col, row);
    z.prop('sewerGrate', 16, 16);
    z.prop('sewerGrate', 35, 16);
    for (const [name, col, row] of [
      ['sewerCrate', 44, 18],
      ['sewerCrate', 45, 18],
      ['sewerBox', 44, 19],
      ['sewerBox', 48, 18],
      ['sewerCrate', 4, 25],
      ['sewerBox', 5, 25],
    ] as const)
      z.prop(name, col, row);
    for (const [col, row] of [
      [6, 2],
      [11, 2],
      [40, 2],
      [46, 2],
      [60, 13],
      [64, 13],
      [6, 39],
      [47, 39],
      [17, 43],
      [35, 43],
    ] as const)
      z.prop('sewerTorch', col, row);
    z.chest('iron', 'deeprelic', ...undercroft.firstOpen(63, 24, 4, 4)); // the flooded gallery
    z.chest('wood', 'elixir', ...undercroft.firstOpen(4, 4, 3, 3)); // the scribes
    z.chest('iron', 'deephoard', ...undercroft.firstOpen(45, 4, 3, 3)); // the armoury
    z.chest('wood', 'elixir', ...undercroft.firstOpen(4, 48, 3, 3));
    z.chest('iron', 'deeprelic', ...undercroft.firstOpen(48, 48, 4, 3));
    z.chest('iron', 'deephoard', ...undercroft.firstOpen(34, 54, 4, 3)); // behind the throne
    z.chest('iron', 'deephoard', 48, 26);
    z.chest('wood', 'elixir', 4, 19);
    z.chest('iron', 'drainwardenCharm', 18, 35);
    z.chest('iron', 'deeprelic', 35, 35);
    z.place('The Drowned Cistern', 26, 22);
    z.place('The Forgotten Chapel', 6, 22);
    z.place("The Cistern King's Court", 26, 34);
    z.place('The Drowned Throne', 26, 54);
  },
});
