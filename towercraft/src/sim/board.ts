// One lane's geometry (Pixi-free). Both players' lanes are the same winding road on a grid; units walk it from the top
// to the bottom, and a unit that reaches the end takes lives from the lane's owner. Positions are in cells (a cell's
// centre is at +0.5), distances are cells walked along the road.

export const COLS = 10;
export const ROWS = 14;

/** The road's corners, as cells: straight runs between each pair. */
export const WAYPOINTS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 3],
  [8, 3],
  [8, 7],
  [1, 7],
  [1, 11],
  [8, 11],
  [8, 13],
];

const centre = ([c, r]: readonly [number, number]): [number, number] => [c + 0.5, r + 0.5];

/** Length of each straight run, and the road's total length (cells). */
const RUNS = WAYPOINTS.slice(1).map((to, i) => {
  const [x0, y0] = centre(WAYPOINTS[i]!);
  const [x1, y1] = centre(to);
  return Math.hypot(x1 - x0, y1 - y0);
});
export const ROAD_LENGTH = RUNS.reduce((a, b) => a + b, 0);

/** Where a unit that has walked `dist` cells is (before the start it waits at the first corner). */
export function pointAt(dist: number): [number, number] {
  let left = Math.max(0, dist);
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

/** Every cell the road covers, as `row * COLS + col` (towers cannot stand on these). */
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

export const cellIndex = (col: number, row: number) => row * COLS + col;
export const inBoard = (col: number, row: number) =>
  Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < COLS && row < ROWS;
