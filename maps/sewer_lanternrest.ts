import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { SEWER_ARRIVAL, UNDERCROFT_ARRIVAL, UNDERCROFT_DOOR, sewerExit } from '../tools/map/delves';

// The Lanternrest sewers: a drain in the market square leads down to a brick-walled maze under the town. Four rooms
// off two walkways along a green channel (two bridges cross it), with a cistern in the south-west. A third walkway runs
// along the bottom, with a pump house, a flooded reservoir and the smugglers' den off it, an east wing, and a central
// shaft joining the old walkways to the new one, so there is more than one way round. Painted by
// tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). What lurks here is in public/content/campaign1/scenarios.json.
const W = 60;
const H = 56;

const sewer = new Delve(W, H);
sewer
  .rect(18, 4, 13, 7) // the entry room
  .tunnel(
    [
      [24, 10],
      [24, 14],
    ],
    3,
  )
  .rect(3, 14, 54, 3) // the north walkway
  .rect(3, 17, 54, 3, '~') // the channel
  .rect(3, 20, 54, 3) // the south walkway
  .rect(14, 17, 3, 3) // two bridges
  .rect(31, 17, 3, 3)
  .rect(48, 17, 3, 3) // a third bridge in the east wing
  .rect(3, 4, 12, 8) // the north-west room
  .rect(7, 11, 3, 4)
  .rect(34, 4, 11, 8) // the north-east room
  .rect(38, 11, 3, 4)
  .rect(45, 6, 3, 3) // a door through to the east room
  .rect(48, 4, 9, 8) // the east room
  .rect(51, 11, 3, 4)
  .rect(3, 23, 12, 9) // the cistern
  .rect(6, 26, 5, 3, '~')
  .rect(33, 23, 12, 9) // the south-east chamber
  .rect(45, 26, 3, 3)
  .rect(48, 23, 9, 9) // the far east chamber
  .rect(51, 22, 3, 1)
  .rect(23, 22, 3, 14) // the central shaft down to the low walkway
  .rect(3, 36, 54, 3) // the low walkway
  .rect(7, 31, 3, 5) // the cistern's way down
  .rect(37, 31, 3, 5) // the south-east chamber's way down
  .rect(51, 31, 3, 5) // the far east chamber's way down
  .rect(7, 38, 3, 4) // down to the pump house
  .rect(3, 42, 14, 11) // the pump house
  .rect(23, 38, 3, 4) // down to the reservoir
  .rect(19, 42, 13, 11) // the flooded reservoir
  .rect(22, 45, 7, 5, '~')
  .rect(17, 46, 2, 3) // pump house to reservoir
  .rect(32, 46, 3, 3) // reservoir to den
  .rect(35, 42, 11, 11) // the smugglers' den
  .rect(40, 38, 3, 4)
  .rect(46, 46, 3, 3) // den to the vault
  .rect(49, 42, 8, 11); // the old vault

export default defineZone({
  name: 'sewer_lanternrest',
  width: W,
  height: H,
  build(z) {
    sewer.paint(z, 'sewer');
    // The way up: an arched doorway in the entry room's back wall, leading to the drain in the market.
    const out = sewerExit();
    z.prop('sewerDoor', 24, 3);
    z.door(24, 3, 1, out.zone, out.col, out.row);
    z.spawn(SEWER_ARRIVAL.col, SEWER_ARRIVAL.row + 2);
    // A second doorway in the north-east room: the stairs down to the Undercroft (maps/sewer_undercroft.ts).
    z.prop('sewerDoor', UNDERCROFT_DOOR.col, UNDERCROFT_DOOR.row);
    z.door(
      UNDERCROFT_DOOR.col,
      UNDERCROFT_DOOR.row,
      1,
      'sewer_undercroft',
      UNDERCROFT_ARRIVAL.col,
      UNDERCROFT_ARRIVAL.row,
    );

    for (const [col, row] of [
      [20, 3],
      [28, 3],
      [6, 3],
      [12, 3],
      [37, 3],
      [42, 3],
      [12, 13],
      [30, 13],
      [43, 13],
    ] as const)
      z.prop('sewerTorch', col, row);
    z.prop('sewerGrate', 16, 13);
    z.prop('sewerGrate', 34, 13);
    z.prop('sewerGate', 4, 13);

    for (const [name, col, row] of [
      ['sewerCrate', 4, 5],
      ['sewerCrate', 5, 5],
      ['sewerBox', 4, 6],
      ['sewerCrate', 43, 5],
      ['sewerBox', 43, 6],
      ['sewerCrate', 13, 24],
      ['sewerBox', 13, 25],
      ['sewerCrate', 34, 24],
    ] as const)
      z.prop(name, col, row);

    for (const [col, row] of [
      [8, 41],
      [14, 41],
      [24, 41],
      [30, 41],
      [38, 41],
      [44, 41],
      [52, 41],
      [52, 3],
    ] as const)
      z.prop('sewerTorch', col, row);
    for (const [name, col, row] of [
      ['sewerCrate', 4, 43],
      ['sewerBox', 5, 43],
      ['sewerCrate', 36, 43],
      ['sewerCrate', 37, 43],
      ['sewerBox', 36, 44],
      ['sewerCrate', 55, 43],
    ] as const)
      z.prop(name, col, row);
    z.chest('iron', 'potion', ...sewer.firstOpen(54, 5, 3, 3)); // the east room
    z.chest('wood', 'elixir', ...sewer.firstOpen(54, 25, 3, 3)); // the far east chamber
    z.chest('iron', 'purse', ...sewer.firstOpen(4, 50, 3, 3)); // the pump house
    z.chest('iron', 'relic', ...sewer.firstOpen(55, 50, 2, 3)); // the old vault
    z.chest('iron', 'hoard', ...sewer.firstOpen(43, 50, 3, 3)); // the smugglers' hoard
    z.chest('iron', 'purse', 13, 10);
    z.chest('wood', 'elixir', 43, 10);
    z.chest('iron', 'potion', 5, 30);
    z.chest('iron', 'relic', 43, 30);
    z.place('The Lanternrest Sewers', 24, 18);
    z.place("The Smugglers' Den", 40, 47);
  },
});
