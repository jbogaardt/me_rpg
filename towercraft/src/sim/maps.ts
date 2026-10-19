// Other maps (Pixi-free), for balance runs only (`tools/towercraftLab.ts`): the game plays `DEFAULT_BOARD` and has the picture for
// that one alone. Each map is turned half way round onto itself (cell (c, r) is cell (cols-1-c, rows-1-r), the road included), so
// neither side has better ground; `symmetric` builds the road that way from its first half, and maps.test.ts checks it.
// Scenery is empty on these maps (no picture, nothing to avoid): only the road and the castles shape the match.

import { DEFAULT_BOARD, makeBoard, type Board } from './board';

type Waypoints = readonly (readonly [number, number])[];

/** A road from its first half to the whole: the half's mirror image (turned half way round) follows it, joined by a straight run. */
export function symmetric(cols: number, rows: number, half: Waypoints): Waypoints {
  const mirror = half.map(([c, r]) => [cols - 1 - c, rows - 1 - r] as const).reverse();
  return [...half, ...mirror];
}

const board = (cols: number, rows: number, waypoints: Waypoints): Board =>
  makeBoard({ cols, rows, waypoints, scenery: [] });

export const MAPS: Record<string, Board> = {
  /** The game's own map: a long winding road over a wooded field. */
  serpent: DEFAULT_BOARD,
  /** The same road with no woods or lakes, to see what the scenery costs. */
  bare: makeBoard({ ...DEFAULT_BOARD, scenery: [] }),
  /** A short road of three runs: fast games, the castles close, little room for towers. */
  switchback: board(
    36,
    31,
    symmetric(36, 31, [
      [5, 3],
      [5, 6],
      [30, 6],
      [30, 15],
    ]),
  ),
  /** A very long road of six runs: slow games, time for towers and the tier 3 units. */
  marathon: board(
    36,
    79,
    symmetric(36, 79, [
      [5, 3],
      [5, 6],
      [30, 6],
      [30, 13],
      [5, 13],
      [5, 20],
      [30, 20],
      [30, 27],
      [5, 27],
      [5, 34],
      [30, 34],
      [30, 39],
    ]),
  ),
  /** One straight road, castle to castle: air and ground arrive together, towers cover the whole of it. */
  straight: board(21, 51, [
    [10, 3],
    [10, 47],
  ]),
};

export const MAP_IDS = Object.keys(MAPS);
