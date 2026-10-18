import { hallDelve, ruinRoom } from '../tools/map/ruinRooms';
import { hallExit } from '../tools/map/delves';

// Inside the roofed hall of the southern Tuskwood Jungle (the `ruinHall` at local 47,66, maps/jungle.ts). Heroes of level 5 to 7.
export default ruinRoom({
  name: 'ruin_hall',
  delve: hallDelve(),
  exit: hallExit,
  place: 'The Roofed Hall',
  chests: [{ kind: 'wood', loot: 'elixir', near: [17, 7, 4, 3] }],
});
