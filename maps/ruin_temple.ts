import { ruinRoom, templeDelve } from '../tools/map/ruinRooms';
import { templeExit } from '../tools/map/delves';

// Inside the old temple of the Tuskwood Jungle (the `ruinTemple` on its north plain, maps/jungle.ts). A small delve for
// heroes of level 5 to 7 (public/content/campaign1/scenarios.json); see tools/map/ruinRooms.ts.
export default ruinRoom({
  name: 'ruin_temple',
  delve: templeDelve(),
  exit: templeExit,
  place: 'The Old Temple',
  chests: [
    { kind: 'iron', loot: 'relic', near: [23, 9, 3, 3] },
    { kind: 'wood', loot: 'elixir', near: [9, 17, 3, 2] },
  ],
});
