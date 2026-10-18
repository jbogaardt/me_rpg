import { hallDelve, ruinRoom } from '../tools/map/ruinRooms';
import { lakeExit } from '../tools/map/delves';

// The Sunken Reliquary: under the Old Lake in the Greenwood, shut until the story drains the lake (the `oldlake` gate of
// maps/greenwood.ts, opened by the quest "stones"). A little vault that held what the Vale kept from the water. Heroes of level 2 to 4.
export default ruinRoom({
  name: 'ruin_lake',
  delve: hallDelve(),
  exit: lakeExit,
  place: 'The Sunken Reliquary',
  chests: [
    { kind: 'iron', loot: 'relic', near: [17, 7, 4, 3] },
    { kind: 'wood', loot: 'potion', near: [11, 5, 3, 3] },
  ],
});
