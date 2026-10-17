import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { SEWER_ARRIVAL, UNDERCROFT_ARRIVAL, UNDERCROFT_DOOR, sewerExit } from '../tools/map/delves';

// The Lanternrest sewers: a drain in the market square leads down to a brick-walled maze under the town. Four rooms
// off two walkways along a green channel (two bridges cross it), with a cistern in the south-west. Painted by
// tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). What lurks here is in public/content/campaign1/scenarios.json.
const W = 48;
const H = 36;

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
  .rect(3, 14, 42, 3) // the north walkway
  .rect(3, 17, 42, 3, '~') // the channel
  .rect(3, 20, 42, 3) // the south walkway
  .rect(14, 17, 3, 3) // two bridges
  .rect(31, 17, 3, 3)
  .rect(3, 4, 12, 8) // the north-west room
  .rect(7, 11, 3, 4)
  .rect(34, 4, 11, 8) // the north-east room
  .rect(38, 11, 3, 4)
  .rect(3, 23, 12, 9) // the cistern
  .rect(6, 26, 5, 3, '~')
  .rect(33, 23, 12, 9); // the south-east chamber

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

    z.chest('iron', 'purse', 13, 10);
    z.chest('wood', 'elixir', 43, 10);
    z.chest('iron', 'potion', 5, 30);
    z.chest('iron', 'relic', 43, 30);
    z.place('The Lanternrest Sewers', 24, 18);
  },
});
