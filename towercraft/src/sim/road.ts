// The roads' raw shapes: the map data both the sim (board.ts) and the picture generator (tools/towercraftBoard.ts) read, so they
// cannot disagree. Every field is COLS x ROWS cells and is turned half way round onto itself (the point (x, y) is the point
// (COLS - x, ROWS - y)), the road included, so neither player has better ground. A road is a polyline of points in cell centres
// (a cell's centre is at +0.5) running from player 0's castle to player 1's; a meandering one is drawn as a few control points for
// player 0's half (ending at the middle of the field), smoothed, and then turned to make the other half.

export const COLS = 36;
export const ROWS = 55;

export type Pt = readonly [number, number];

export interface RoadDef {
  id: string;
  name: string;
  blurb: string;
  /** Cells whose centre is this near the road are road (a cell on a straight run: 0.5 is one wide, 1 is three). */
  halfWidth: number;
  /** The road as a dense polyline, castle to castle. */
  points: readonly Pt[];
}

/** A point turned half way round the field. */
export const turned = ([x, y]: Pt): [number, number] => [COLS - x, ROWS - y];

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

/** Player 0's half (control points ending at the field's middle) made a whole road: the curve, then its turn. */
export function meander(half: readonly Pt[]): [number, number][] {
  const whole = [...half, ...[...half].reverse().slice(1).map(turned)];
  return smooth(whole);
}

const centre = ([c, r]: Pt): [number, number] => [c + 0.5, r + 0.5];

/** The original road: straight runs back and forth across the field (corners in cells). */
const SWITCHBACK: readonly Pt[] = (
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

/** A zigzag of straight runs on the diagonal: player 0's half, then its turn. */
const zigzag = (half: readonly Pt[]): [number, number][] => [
  ...half.map((p) => [...p] as [number, number]),
  ...[...half].reverse().slice(1).map(turned),
];

export const ROADS: readonly RoadDef[] = [
  {
    id: 'greenwood',
    name: 'Greenwood Switchbacks',
    blurb: 'Long straight runs back and forth through the greenwood: easy to read, easy to hold.',
    halfWidth: 1,
    points: SWITCHBACK,
  },
  {
    id: 'frostlands',
    name: 'Frostbound Serpent',
    blurb: 'A snowy road that coils through frozen lakes: long hairpins that bunch the fighting at every bend.',
    halfWidth: 1,
    points: meander([
      [6, 4],
      [7, 8],
      [16, 6],
      [28, 8],
      [31, 13],
      [22, 16],
      [10, 14],
      [5, 19],
      [9, 23],
      [22, 22],
      [28, 26],
      [18, 27.5],
    ]),
  },
  {
    id: 'desert',
    name: 'Dune Caravan Trail',
    blurb: 'A lazy caravan trail over red sand and dunes, round an oasis: wide curves, long sight lines.',
    halfWidth: 1,
    points: meander([
      [6, 4],
      [14, 7],
      [27, 5],
      [31, 11],
      [22, 15],
      [9, 13],
      [5, 19],
      [12, 23],
      [24, 22],
      [28, 26],
      [18, 27.5],
    ]),
  },
  {
    id: 'mire',
    name: 'Witchmire Causeway',
    blurb: 'A muddy causeway that winds between black pools, starting in the east: the bends hide what is coming.',
    halfWidth: 1,
    points: meander([
      [30, 4],
      [22, 8],
      [10, 5],
      [5, 11],
      [12, 15],
      [26, 13],
      [31, 19],
      [24, 23],
      [10, 21],
      [8, 26],
      [18, 27.5],
    ]),
  },
  {
    id: 'ember',
    name: 'Ashen Pass',
    blurb: 'A cracked road in a burnt land, in sharp diagonal zigzags between lava lakes: short, brutal runs.',
    halfWidth: 1,
    points: zigzag([
      [6, 4],
      [30, 10],
      [6, 16],
      [30, 22],
      [18, 27.5],
    ]),
  },
];
