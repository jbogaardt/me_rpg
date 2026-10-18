import { ruinRoom, templeDelve } from '../tools/map/ruinRooms';
import { desertTempleExit } from '../tools/map/delves';

// Inside the half-buried temple of the Sunscar Desert (the `ruinTemple` at 96,40, maps/desert.ts). Heroes of level 4 to 6.
export default ruinRoom({
  name: 'ruin_temple_desert',
  delve: templeDelve(),
  exit: desertTempleExit,
  place: 'The Buried Temple',
  chests: [
    { kind: 'iron', loot: 'topaz', near: [23, 9, 3, 3] },
    { kind: 'wood', loot: 'elixir', near: [9, 17, 3, 2] },
  ],
});
