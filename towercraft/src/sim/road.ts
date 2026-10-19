// The road's raw shape: the one piece of map data both the sim (board.ts) and the picture generator (tools/towercraftBoard.ts)
// read, so they cannot disagree. The field is turned half way round onto itself (cell (c, r) is cell (COLS-1-c, ROWS-1-r)), the
// road included, so neither player has better ground.

export const COLS = 36;
export const ROWS = 55;

/** The road's corners, as cells: straight runs between each pair. The first is player 0's castle, the last player 1's. */
export const WAYPOINTS: readonly (readonly [number, number])[] = [
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
  [30, 41],
  [5, 41],
  [5, 48],
  [30, 48],
  [30, 51],
];
