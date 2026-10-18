import { defineZone } from '../tools/map/zone';
import { Delve } from '../tools/map/delve';
import { TEMPLE_ARRIVAL, templeExit } from '../tools/map/delves';

// Inside the old temple of the Tuskwood Jungle (the `ruinTemple` on its north plain, maps/jungle.ts): a porch under the
// arch, a pillared nave north to the priest's chamber, and a side vault with the temple's offering. Painted by
// tools/map/delve.ts (art by MrBeast, art/oga_dungeon/). A small delve for heroes of level 5 to 7.
const W = 28;
const H = 22;

export const TEMPLE = { porch: [12, 5], nave: [12, 11], chamber: [12, 18], vault: [22, 11] } as const;

export const temple = new Delve(W, H);
temple
  .rect(9, 3, 7, 4) // the porch
  .rect(8, 7, 9, 8) // the nave
  .tunnel(
    [
      [12, 15],
      [12, 16],
    ],
    3,
  )
  .rect(8, 16, 9, 4) // the priest's chamber
  .tunnel(
    [
      [17, 11],
      [20, 11],
    ],
    3,
  )
  .rect(19, 8, 7, 6); // the vault

export default defineZone({
  name: 'ruin_temple',
  width: W,
  height: H,
  build(z) {
    temple.paint(z, 'cave');
    const out = templeExit();
    const top = (col: number) => {
      for (let row = 0; row < H; row++) if (temple.open(col, row)) return row - 1;
      throw new Error(`column ${col} is all rock`);
    };
    z.prop('caveExit', TEMPLE_ARRIVAL.col - 1, top(TEMPLE_ARRIVAL.col));
    z.door(TEMPLE_ARRIVAL.col, top(TEMPLE_ARRIVAL.col), 1, out.zone, out.col, out.row);
    z.spawn(TEMPLE_ARRIVAL.col, TEMPLE_ARRIVAL.row + 1);
    z.chest('iron', 'relic', ...temple.firstOpen(23, 9, 3, 3));
    z.chest('wood', 'elixir', ...temple.firstOpen(9, 17, 3, 2));
    z.place('The Old Temple', 12, 11);
  },
});
