// The map (Pixi-free): ONE road from player 0's castle to player 1's, winding back and forth across a tall field (road.ts has its
// shape, scenery.ts the cells woods and lakes cover). Units of
// player 0 walk it from the start, player 1's from the end, so they meet somewhere between. Positions are in cells (a cell's
// centre is at +0.5); a distance is cells along the road from its start. Towers go on the free cells beside the road.

import { COLS, ROWS, WAYPOINTS } from './road';
import { SCENERY } from './scenery';

export { COLS, ROWS, WAYPOINTS };

const centre = ([c, r]: readonly [number, number]): [number, number] => [c + 0.5, r + 0.5];

const RUNS = WAYPOINTS.slice(1).map((to, i) => {
  const [x0, y0] = centre(WAYPOINTS[i]!);
  const [x1, y1] = centre(to);
  return Math.hypot(x1 - x0, y1 - y0);
});
/** The road's length in cells. */
export const ROAD_LENGTH = RUNS.reduce((a, b) => a + b, 0);

/** Where a unit that has walked `dist` cells from the road's start is (clamped to the road). */
export function pointAt(dist: number): [number, number] {
  let left = Math.min(Math.max(0, dist), ROAD_LENGTH);
  for (let i = 0; i < RUNS.length; i++) {
    const run = RUNS[i]!;
    if (left <= run) {
      const [x0, y0] = centre(WAYPOINTS[i]!);
      const [x1, y1] = centre(WAYPOINTS[i + 1]!);
      const t = run === 0 ? 0 : left / run;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    left -= run;
  }
  return centre(WAYPOINTS[WAYPOINTS.length - 1]!);
}

/** Which way (in the road's own direction, start to end) the road runs at `dist`. */
export function headingAt(dist: number): 'up' | 'down' | 'left' | 'right' {
  let left = Math.max(0, dist);
  for (let i = 0; i < RUNS.length; i++) {
    if (left <= RUNS[i]! || i === RUNS.length - 1) {
      const [x0, y0] = WAYPOINTS[i]!;
      const [x1, y1] = WAYPOINTS[i + 1]!;
      return x1 !== x0 ? (x1 > x0 ? 'right' : 'left') : y1 > y0 ? 'down' : 'up';
    }
    left -= RUNS[i]!;
  }
  return 'down';
}

/** Every cell the road covers, as `row * COLS + col`. */
export const ROAD_CELLS: ReadonlySet<number> = (() => {
  const cells = new Set<number>();
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [c0, r0] = WAYPOINTS[i]!;
    const [c1, r1] = WAYPOINTS[i + 1]!;
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) cells.add(r * COLS + c);
  }
  return cells;
})();

/** Cells the scenery covers (woods, lakes, rocks): nothing is built there. Generated with the picture: `npm run towercraft:board`. */
export const SCENERY_CELLS: ReadonlySet<number> = new Set(SCENERY);

export const cellIndex = (col: number, row: number) => row * COLS + col;
export const inBoard = (col: number, row: number) =>
  Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < COLS && row < ROWS;

/** Where each player's castle stands (cell centre, in cells). */
export const CASTLES: readonly [[number, number], [number, number]] = [
  centre(WAYPOINTS[0]!),
  centre(WAYPOINTS[WAYPOINTS.length - 1]!),
];
/** Cells within this distance of a castle's centre belong to the castle: nothing is built there. */
export const CASTLE_CLEAR = 2.2;

/** Where the road's nearest straight run lies from a point, measured at right angles (so a unit can step straight off it). */
export interface Foot {
  /** Cells along the road from its start to the point on it straight across from the tower. */
  s: number;
  /** Cells between that point on the road and the tower, straight across. */
  d: number;
  /** The way off the road toward the tower (a unit vector along one axis: never diagonal). */
  dir: [number, number];
}

const feet = new Map<number, Foot | null>();

/**
 * The road point straight across from a cell (the closest run the cell lies beside, measured square to that run), or nothing when
 * the cell is past a corner and no run is straight across from it. Units leave the road here and nowhere else to reach a tower.
 */
export function footOf(col: number, row: number): Foot | undefined {
  const key = cellIndex(col, row);
  let best = feet.get(key);
  if (best !== undefined) return best ?? undefined;
  const [tx, ty] = centre([col, row]);
  best = null;
  let walked = 0;
  for (let i = 0; i < RUNS.length; i++) {
    const [x0, y0] = centre(WAYPOINTS[i]!);
    const [x1, y1] = centre(WAYPOINTS[i + 1]!);
    if (y0 === y1 && tx >= Math.min(x0, x1) && tx <= Math.max(x0, x1)) {
      const d = Math.abs(ty - y0);
      if (d > 0 && (!best || d < best.d)) best = { s: walked + Math.abs(tx - x0), d, dir: [0, Math.sign(ty - y0)] };
    } else if (x0 === x1 && ty >= Math.min(y0, y1) && ty <= Math.max(y0, y1)) {
      const d = Math.abs(tx - x0);
      if (d > 0 && (!best || d < best.d)) best = { s: walked + Math.abs(ty - y0), d, dir: [Math.sign(tx - x0), 0] };
    }
    walked += RUNS[i]!;
  }
  feet.set(key, best);
  return best ?? undefined;
}
