// The roads' raw shapes: the map data both the sim (board.ts) and the picture generator (tools/towercraftBoard.ts) read, so they
// cannot disagree. Every field is COLS x ROWS cells. A road is a polyline of points in cell centres (a cell's centre is at +0.5)
// running from player 0's castle to player 1's. The classic road is straight runs and is turned half way round onto itself; the
// others are free meanders (control points, smoothed) that are NOT symmetric: each side has its own ground, and the balance
// harness (alternating sides) and `board.test.ts` (open ground by each castle) keep that fair.

/** The grid the roads were drawn on (cells). Every map is `GROW` times as wide and tall as that, so there is room between the bends for the buildings. */
export const DRAWN_COLS = 36;
export const DRAWN_ROWS = 55;
export const GROW = 2;
/** Extra cells of open ground on the east and west of the grown field, so the clearings between the road's bends and the woods at the edges have room for buildings. */
export const EDGE = 8;

export type Pt = readonly [number, number];

export interface RoadDef {
  id: string;
  /** The field's size in cells. */
  cols: number;
  rows: number;
  name: string;
  blurb: string;
  /** Cells whose centre is this near the road are road (a cell on a straight run: 0.5 is one wide, 1 is three). */
  halfWidth: number;
  /** The road as a dense polyline, castle to castle. */
  points: readonly Pt[];
}

/** A smooth curve through the control points (Catmull-Rom), sampled about every half cell. */
export function smooth(controls: readonly Pt[], step = 0.5): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number) => controls[Math.min(controls.length - 1, Math.max(0, i))]!;
  for (let i = 0; i < controls.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const [t2, t3] = [t * t, t * t * t];
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([...controls[controls.length - 1]!]);
  return out;
}

const centre = ([c, r]: Pt): [number, number] => [c + 0.5, r + 0.5];

/** Control points drawn for the classic field, spread over the grown one. */
const grow = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [x * GROW + EDGE, y * GROW]);
const [GCOLS, GROWS] = [Math.round(DRAWN_COLS * GROW) + 2 * EDGE, Math.round(DRAWN_ROWS * GROW)];
/** The classic field has an odd number of rows so its middle run sits on a row of cells and the road still turns onto itself. */
const [COLS, ROWS] = [GCOLS, GROWS + 1];
export { COLS, ROWS };

/** The classic road: straight runs back and forth across the field (corners in cells); the one symmetric road. */
export const DRAWN_SWITCHBACK: readonly Pt[] = (
  [
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
  ] as const
).map(centre);

/** The classic road at `GROW` times its drawn size, every corner on a cell centre and the whole turning onto itself (the middle run, drawn at row 27, is row `ROWS / 2`). */
const SWITCHBACK: readonly Pt[] = DRAWN_SWITCHBACK.map(([x, y]) => [
  x * GROW + EDGE + 0.5 * (x < DRAWN_COLS / 2 ? 1 : -1),
  y === DRAWN_ROWS / 2 ? ROWS / 2 : y * GROW + (y < DRAWN_ROWS / 2 ? -0.5 : 1.5),
]);

export const ROADS: readonly RoadDef[] = [
  {
    id: 'greenwood',
    cols: COLS,
    rows: ROWS,
    name: 'Greenwood Switchbacks (classic)',
    blurb: 'Long straight runs back and forth through the greenwood: easy to read, easy to hold.',
    halfWidth: 1,
    points: SWITCHBACK,
  },
  {
    id: 'frostlands',
    cols: GCOLS,
    rows: GROWS,
    name: 'Frostbound Serpent',
    blurb: 'A snowy road that coils back on itself through drifts and frozen lakes: no two bends alike.',
    halfWidth: 1,
    points: smooth(
      grow([
        [10, 8],
        [14, 5],
        [21, 4],
        [30, 7],
        [31, 13],
        [22, 15],
        [12, 12],
        [6, 15],
        [5, 22],
        [13, 25],
        [24, 21],
        [31, 24],
        [30, 31],
        [21, 33],
        [13, 30],
        [6, 33],
        [6, 38],
        [14, 40],
        [26, 37],
        [31, 41],
        [29, 46],
        [21, 47],
        [12, 47],
      ]),
    ),
  },
  {
    id: 'desert',
    cols: GCOLS,
    rows: GROWS,
    name: 'Dune Caravan Trail',
    blurb: 'A lazy caravan trail looping over red sand and dunes, starting in the east: wide curves, long sight lines.',
    halfWidth: 1,
    points: smooth(
      grow([
        [26, 8],
        [20, 5],
        [13, 4],
        [6, 7],
        [6, 14],
        [14, 17],
        [23, 14],
        [30, 15],
        [31, 22],
        [23, 26],
        [15, 23],
        [7, 27],
        [5, 33],
        [12, 34],
        [21, 30],
        [29, 33],
        [30, 40],
        [22, 43],
        [14, 39],
        [7, 42],
        [9, 48],
        [17, 47],
      ]),
    ),
  },
  {
    id: 'mire',
    cols: GCOLS,
    rows: GROWS,
    name: 'Witchmire Causeway',
    blurb: 'A muddy causeway wandering between black pools: the bends hide what is coming.',
    halfWidth: 1,
    points: smooth(
      grow([
        [9, 8],
        [14, 4],
        [24, 7],
        [31, 12],
        [25, 17],
        [16, 13],
        [8, 17],
        [6, 24],
        [14, 27],
        [23, 22],
        [31, 27],
        [28, 34],
        [19, 31],
        [11, 35],
        [6, 41],
        [13, 45],
        [22, 41],
        [30, 45],
        [26, 47],
      ]),
    ),
  },
  {
    id: 'ember',
    cols: GCOLS,
    rows: GROWS,
    name: 'Ashen Pass',
    blurb: 'A cracked road in a burnt land, in long uneven diagonals between lava lakes: short, brutal runs.',
    halfWidth: 1,
    points: smooth(
      grow([
        [9, 8],
        [29, 9],
        [8, 17],
        [30, 25],
        [7, 33],
        [30, 38],
        [8, 46],
        [18, 47],
      ]),
    ),
  },
];
