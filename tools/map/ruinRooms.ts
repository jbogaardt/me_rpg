// The rooms behind the ruins' arches (the temple and hall of ruins.png): small cave-style delves, one zone per arch.
// Shared by maps/ruin_*.ts so each is a few lines: where it leads out, what it holds. Core engine (a map and a door);
// who lives inside is content (a scenario node per zone, one biome entry linking back).

import { Delve } from './delve';
import { defineZone } from './zone';

/** Where a player appears inside a ruin room: just in from the way out. */
export const RUIN_ARRIVAL = { col: 12, row: 3 } as const;

/** A porch, a pillared nave, a priest's chamber and a side vault (28x22). */
export const templeDelve = () =>
  new Delve(28, 22)
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

/** One long hall with an alcove off it (24x18). */
export const hallDelve = () => new Delve(24, 18).rect(9, 3, 7, 11).rect(16, 6, 6, 5); // the hall, the alcove

interface RuinRoom {
  name: string;
  delve: Delve;
  exit: () => { zone: string; col: number; row: number };
  place: string;
  chests: { kind: string; loot: string; near: [number, number, number, number] }[];
}

export const ruinRoom = ({ name, delve, exit, place, chests }: RuinRoom) =>
  defineZone({
    name,
    width: delve.width,
    height: delve.height,
    build(z) {
      delve.paint(z, 'cave');
      const out = exit();
      let row = 0;
      while (!delve.open(RUIN_ARRIVAL.col, row)) row++;
      z.prop('caveExit', RUIN_ARRIVAL.col - 1, row - 1);
      z.door(RUIN_ARRIVAL.col, row - 1, 1, out.zone, out.col, out.row);
      z.spawn(RUIN_ARRIVAL.col, RUIN_ARRIVAL.row + 1);
      for (const c of chests) z.chest(c.kind, c.loot, ...delve.firstOpen(...c.near));
      z.place(place, 12, Math.floor(delve.height / 2));
    },
  });
