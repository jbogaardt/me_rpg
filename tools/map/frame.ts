// The frame every marches region shares (maps/marches_*): a wood round the map, open at the four ports, and the two roads
// that join them (north to south with a jog, west to east with a jog), so a region's own map is only its ground, its
// water and its landmarks. Each port is one edge's doorway; the content decides where it leads, and one nothing binds is
// sealed with `seal`. The roads are returned so the caller can paint them under the wood.
import type { PrefabName } from './catalog';
import { trail } from './helpers';
import type { Rect, ZoneApi } from './zone';

export interface Frame {
  /** The wood's trees, and what closes a port nothing leads through. */
  trees: readonly PrefabName[];
  seal: readonly PrefabName[];
  /** The column each of the north and south ports is centred on, and the row of the west and east ones. */
  north: number;
  south: number;
  west: number;
  east: number;
  /** Where each road jogs sideways (a row for the north-south one, a column for the west-east one). */
  jogRow: number;
  jogCol: number;
  seed?: number;
}

/** The two roads of a frame, as rects to paint (and keep clear): they run to all four ports. */
export function frameRoads(z: Pick<ZoneApi, 'width' | 'height'>, f: Frame): { ns: Rect[]; we: Rect[] } {
  const [w, h] = [z.width, z.height];
  const ns = trail([
    [f.north, 2],
    [f.north, f.jogRow],
    [f.south, f.jogRow],
    [f.south, h - 2],
  ]);
  const we = trail([
    [1, f.west],
    [f.jogCol, f.west],
    [f.jogCol, f.east],
    [w - 2, f.east],
  ]);
  return { ns, we };
}

/** The wood round the map with a gap at each port, and the four ports (arriving two cells inside the wood). */
export function frame(z: ZoneApi, f: Frame) {
  const [w, h] = [z.width, z.height];
  const trees = [...f.trees];
  const seed = f.seed ?? 1;
  const opts = (i: number) => ({ trees, seed: seed * 10 + i });
  z.forest({ col: -3, row: -3, w: f.north + 2, h: 7 }, opts(1));
  z.forest({ col: f.north + 4, row: -3, w: w - f.north - 1, h: 7 }, opts(2));
  z.forest({ col: -3, row: h - 4, w: f.south + 2, h: 7 }, opts(3));
  z.forest({ col: f.south + 4, row: h - 4, w: w - f.south - 1, h: 7 }, opts(4));
  z.forest({ col: -3, row: 4, w: 6, h: f.west - 6 }, opts(5));
  z.forest({ col: -3, row: f.west + 3, w: 6, h: h - 4 - (f.west + 3) }, opts(6));
  z.forest({ col: w - 3, row: 4, w: 6, h: f.east - 6 }, opts(7));
  z.forest({ col: w - 3, row: f.east + 3, w: 6, h: h - 4 - (f.east + 3) }, opts(8));
  z.port('north', f.north - 1, 1, 3, f.north, 4, 1, [...f.seal]);
  z.port('south', f.south - 1, h - 2, 3, f.south, h - 6, 1, [...f.seal]);
  z.port('west', 0, f.west - 1, 1, 3, f.west, 3, [...f.seal]);
  z.port('east', w - 1, f.east - 1, 1, w - 4, f.east, 3, [...f.seal]);
}
