// The map (Pixi-free): ONE road from player 0's castle to player 1's, winding back and forth across a tall field (road.ts has its
// shape, scenery.ts the cells woods and lakes cover). Units of
// player 0 walk it from the start, player 1's from the end, so they meet somewhere between. Positions are in cells (a cell's
// centre is at +0.5); a distance is cells along the road from its start. Towers go on the free cells beside the road.

import { COLS, ROWS, WAYPOINTS } from './road';
import { SCENERY } from './scenery';

export { COLS, ROWS, WAYPOINTS };

const centre = ([c, r]: readonly [number, number]): [number, number] => [c + 0.5, r + 0.5];

/** What makes a map: its size, the road's corners (first is player 0's castle, last player 1's) and the cells nothing is built on. */
export interface BoardSpec {
  cols: number;
  rows: number;
  waypoints: readonly (readonly [number, number])[];
  /** Cells (`row * cols + col`) woods, lakes and rocks cover. */
  scenery: readonly number[];
}

/** A map ready to play on: the spec plus everything the rules ask of it. A match carries its board (`Match.board`). */
export interface Board {
  cols: number;
  rows: number;
  waypoints: BoardSpec['waypoints'];
  /** The road's length in cells. */
  roadLength: number;
  /** How far (cells) an air unit flies between the castles: the straight line. */
  airLength: number;
  /** Where each player's castle stands (cell centre, in cells). */
  castles: readonly [[number, number], [number, number]];
  /** Every cell the road covers, as `row * cols + col`. */
  roadCells: ReadonlySet<number>;
  sceneryCells: ReadonlySet<number>;
  /** Where a unit that has walked `dist` cells from the road's start is (clamped to the road). */
  pointAt: (dist: number) => [number, number];
  /** Which way (in the road's own direction, start to end) the road runs at `dist`. */
  headingAt: (dist: number) => 'up' | 'down' | 'left' | 'right';
  cellIndex: (col: number, row: number) => number;
  inBoard: (col: number, row: number) => boolean;
}

export function makeBoard(spec: BoardSpec): Board {
  const { cols, rows, waypoints } = spec;
  const runs = waypoints.slice(1).map((to, i) => {
    const [x0, y0] = centre(waypoints[i]!);
    const [x1, y1] = centre(to);
    return Math.hypot(x1 - x0, y1 - y0);
  });
  const roadLength = runs.reduce((a, b) => a + b, 0);
  const castles: Board['castles'] = [centre(waypoints[0]!), centre(waypoints[waypoints.length - 1]!)];
  const roadCells = new Set<number>();
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [c0, r0] = waypoints[i]!;
    const [c1, r1] = waypoints[i + 1]!;
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) roadCells.add(r * cols + c);
  }
  return {
    cols,
    rows,
    waypoints,
    roadLength,
    airLength: Math.hypot(castles[1][0] - castles[0][0], castles[1][1] - castles[0][1]),
    castles,
    roadCells,
    sceneryCells: new Set(spec.scenery),
    pointAt: (dist) => {
      let left = Math.min(Math.max(0, dist), roadLength);
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i]!;
        if (left <= run) {
          const [x0, y0] = centre(waypoints[i]!);
          const [x1, y1] = centre(waypoints[i + 1]!);
          const t = run === 0 ? 0 : left / run;
          return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        }
        left -= run;
      }
      return centre(waypoints[waypoints.length - 1]!);
    },
    headingAt: (dist) => {
      let left = Math.max(0, dist);
      for (let i = 0; i < runs.length; i++) {
        if (left <= runs[i]! || i === runs.length - 1) {
          const [x0, y0] = waypoints[i]!;
          const [x1, y1] = waypoints[i + 1]!;
          return x1 !== x0 ? (x1 > x0 ? 'right' : 'left') : y1 > y0 ? 'down' : 'up';
        }
        left -= runs[i]!;
      }
      return 'down';
    },
    cellIndex: (col, row) => row * cols + col,
    inBoard: (col, row) =>
      Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < cols && row < rows,
  };
}

/** The map the game plays on (and the default of a match). Other maps for balance runs are in maps.ts. */
export const DEFAULT_BOARD: Board = makeBoard({ cols: COLS, rows: ROWS, waypoints: WAYPOINTS, scenery: SCENERY });

// The default board's parts, for the renderer and the tests (the game has one map).
export const ROAD_LENGTH = DEFAULT_BOARD.roadLength;
export const pointAt = DEFAULT_BOARD.pointAt;
export const headingAt = DEFAULT_BOARD.headingAt;
export const ROAD_CELLS = DEFAULT_BOARD.roadCells;
export const SCENERY_CELLS = DEFAULT_BOARD.sceneryCells;
export const cellIndex = DEFAULT_BOARD.cellIndex;
export const inBoard = DEFAULT_BOARD.inBoard;
export const CASTLES = DEFAULT_BOARD.castles;
/** Cells within this distance of a castle's centre belong to the castle: nothing is built there. */
export const CASTLE_CLEAR = 2.2;
