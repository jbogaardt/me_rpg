// The maps (Pixi-free): each is ONE road from player 0's castle to player 1's across a tall field (road.ts has the roads' shapes,
// scenery.ts the cells woods, lakes and rocks cover on each). Units of player 0 walk the road from its start, player 1's from its
// end, so they meet somewhere between. Positions are in cells (a cell's centre is at +0.5); a distance is cells along the road
// from its start. Towers go on the free cells beside the road. Every field is the same size and turned half way round onto itself,
// so the AI's two sides (and a human's) have the same ground whichever map is played.

import { COLS, ROADS, ROWS, type Pt } from './road';
import { SCENERY } from './scenery';

export { COLS, ROWS };

export const BOARD_IDS = ROADS.map((r) => r.id);
export type BoardId = string;

export interface Board {
  id: BoardId;
  name: string;
  blurb: string;
  /** The road's length in cells. */
  length: number;
  /** How far an air unit flies between the castles: the straight line. */
  airLength: number;
  /** Where each player's castle stands (cell centre, in cells). */
  castles: readonly [[number, number], [number, number]];
  /** Every cell the road covers, as `row * COLS + col`. */
  roadCells: ReadonlySet<number>;
  /** Cells the scenery covers (woods, lakes, rocks): nothing is built there. Generated with the picture: `npm run towercraft:board`. */
  sceneryCells: ReadonlySet<number>;
  /** Where a unit that has walked `dist` cells from the road's start is (clamped to the road). */
  pointAt(dist: number): [number, number];
  /** Which way the road runs at `dist` (start to end), as a unit vector. */
  headingAt(dist: number): [number, number];
}

export const cellIndex = (col: number, row: number) => row * COLS + col;
export const inBoard = (col: number, row: number) =>
  Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < COLS && row < ROWS;

/** Cells within this distance of a castle's centre belong to the castle: nothing is built there. */
export const CASTLE_CLEAR = 2.2;

/** The cells within `halfWidth` of the polyline (measured from each cell's centre). */
function roadCellsOf(points: readonly Pt[], halfWidth: number): Set<number> {
  const cells = new Set<number>();
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i]!, points[i + 1]!];
    const [c0, c1] = [
      Math.floor(Math.min(a[0], b[0]) - halfWidth - 1),
      Math.ceil(Math.max(a[0], b[0]) + halfWidth + 1),
    ];
    const [r0, r1] = [
      Math.floor(Math.min(a[1], b[1]) - halfWidth - 1),
      Math.ceil(Math.max(a[1], b[1]) + halfWidth + 1),
    ];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len2 = dx * dx + dy * dy || 1;
    for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++)
      for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) {
        const t = Math.min(1, Math.max(0, ((c + 0.5 - a[0]) * dx + (r + 0.5 - a[1]) * dy) / len2));
        if (Math.hypot(c + 0.5 - (a[0] + dx * t), r + 0.5 - (a[1] + dy * t)) <= halfWidth + 1e-9)
          cells.add(cellIndex(c, r));
      }
  }
  return cells;
}

export function makeBoard(def: (typeof ROADS)[number], scenery: readonly number[]): Board {
  const { points } = def;
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const length = cum[cum.length - 1]!;
  /** The index of the segment (points[i] to points[i + 1]) that distance `dist` falls on. */
  const segment = (dist: number) => {
    let [lo, hi] = [0, points.length - 2];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid + 1]! < dist) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const castles: [[number, number], [number, number]] = [[...points[0]!], [...points[points.length - 1]!]];
  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    length,
    airLength: Math.hypot(castles[1][0] - castles[0][0], castles[1][1] - castles[0][1]),
    castles,
    roadCells: roadCellsOf(points, def.halfWidth),
    sceneryCells: new Set(scenery),
    pointAt(dist) {
      const d = Math.min(Math.max(0, dist), length);
      const i = segment(d);
      const [a, b] = [points[i]!, points[i + 1]!];
      const run = cum[i + 1]! - cum[i]!;
      const t = run === 0 ? 0 : (d - cum[i]!) / run;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
    headingAt(dist) {
      const i = segment(Math.min(Math.max(0, dist), length));
      const [a, b] = [points[i]!, points[i + 1]!];
      const run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / run, (b[1] - a[1]) / run];
    },
  };
}

export const BOARDS: Readonly<Record<BoardId, Board>> = Object.fromEntries(
  ROADS.map((def) => [def.id, makeBoard(def, SCENERY[def.id] ?? [])]),
);
export const DEFAULT_BOARD_ID: BoardId = 'greenwood';
export const DEFAULT_BOARD: Board = BOARDS[DEFAULT_BOARD_ID]!;

// The default map's own constants, for the tests and tools that deal with one map.
export const CASTLES = DEFAULT_BOARD.castles;
export const ROAD_CELLS = DEFAULT_BOARD.roadCells;
export const ROAD_LENGTH = DEFAULT_BOARD.length;
export const pointAt = (dist: number) => DEFAULT_BOARD.pointAt(dist);
export const SCENERY_CELLS = DEFAULT_BOARD.sceneryCells;
