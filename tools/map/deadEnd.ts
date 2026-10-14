// A dead end for random campaigns (public/content/packs/, a `terminal` region): a small clearing walled by woods, one
// port on one edge with a trail running in from it, and something at the far end worth the walk. The assembler bolts
// one onto a port nothing else uses, so the world has no doorways that lead nowhere.
import type { PrefabName } from './catalog';
import { blob, pond, trail } from './helpers';
import type { ZoneApi } from './zone';
import type { ClimateName } from '../../src/systems/weather';

export const DEAD_END = { W: 30, H: 22 } as const;

export interface DeadEndSpec {
  climate: ClimateName;
  /** The base ground: a fill and, optionally, a terrain painted over all of it. */
  fill: 'grass' | 'snow';
  ground?: 'ash' | 'snow';
  path: 'mud' | 'dirt';
  trees: PrefabName[];
  fillers: PrefabName[];
  /** The edge its one port is on. */
  side: 'north' | 'south' | 'east' | 'west';
  /** A pool at the far end. */
  water?: 'pond' | 'murk' | 'lava' | 'abyss';
  ice?: boolean;
  props: [PrefabName, number, number][];
  chest: [kind: string, loot: string];
  place: string;
}

/** Build a dead end: the chest stands at its far end, where the pack puts a guard. */
export function deadEnd(z: ZoneApi, s: DeadEndSpec): void {
  const { W, H } = DEAD_END;
  z.climate(s.climate);
  z.fill(s.fill);
  if (s.ground) z.paint(s.ground, { col: -2, row: -2, w: W + 4, h: H + 4 });
  const mid = { col: 15, row: 11 };
  // The port, the trail in from it and the far end, by the edge it is on.
  const far = {
    north: { col: 15, row: 16 },
    south: { col: 15, row: 5 },
    west: { col: 24, row: 11 },
    east: { col: 6, row: 11 },
  }[s.side];
  const door = {
    north: { col: 15, row: 1 },
    south: { col: 15, row: H - 2 },
    west: { col: 1, row: 11 },
    east: { col: W - 2, row: 11 },
  }[s.side];
  z.paint(
    s.path,
    trail([
      [door.col, door.row],
      [mid.col, mid.row],
      [far.col, far.row],
    ]),
  );
  const wood = (col: number, row: number, w: number, h: number, seed: number) =>
    z.forest({ col, row, w, h }, { trees: s.trees, seed });
  // The woods round the edge, open only at the port.
  if (s.side === 'north') {
    wood(-3, -3, 16, 6, 1);
    wood(18, -3, W - 15, 6, 2);
  } else wood(-3, -3, W + 6, 6, 1);
  if (s.side === 'south') {
    wood(-3, H - 3, 16, 6, 3);
    wood(18, H - 3, W - 15, 6, 4);
  } else wood(-3, H - 3, W + 6, 6, 3);
  if (s.side === 'west') {
    wood(-3, 3, 5, 7, 5);
    wood(-3, 13, 5, H - 16, 6);
  } else wood(-3, 3, 5, H - 6, 5);
  if (s.side === 'east') {
    wood(W - 2, 3, 5, 7, 7);
    wood(W - 2, 13, 5, H - 16, 8);
  } else wood(W - 2, 3, 5, H - 6, 7);
  if (s.side === 'north') z.port('north', 14, 0, 3, 15, 3, 1, s.fillers);
  if (s.side === 'south') z.port('south', 14, H - 1, 3, 15, H - 4, 1, s.fillers);
  if (s.side === 'west') z.port('west', 0, 10, 1, 3, 11, 3, s.fillers);
  if (s.side === 'east') z.port('east', W - 1, 10, 1, W - 4, 11, 3, s.fillers);

  // The far end: a pool beside it, a chest at it.
  const pool = {
    col: far.col + (s.side === 'west' ? -6 : 3),
    row: far.row + (s.side === 'south' ? 2 : -4),
    w: 4,
    h: 3,
  };
  if (s.water) pond(z, pool, { water: s.water, shore: s.fill === 'snow' ? 'snow' : 'mud' });
  if (s.ice) z.paint('ice', blob(pool));
  for (const [name, col, row] of s.props) z.prop(name, col, row);
  z.chest(s.chest[0], s.chest[1], far.col, far.row);
  const arrive = { north: [15, 3], south: [15, H - 4], west: [3, 11], east: [W - 4, 11] }[s.side];
  z.spawn(arrive[0], arrive[1]);
  z.place(s.place, mid.col, mid.row);
}
