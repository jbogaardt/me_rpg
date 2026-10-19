// The roads' raw shapes: the map data both the sim (board.ts) and the picture generator (tools/towercraftBoard.ts) read, so they
// cannot disagree. Every field is COLS x ROWS cells. A road is a polyline of points in cell centres (a cell's centre is at +0.5)
// running from player 0's castle to player 1's. The classic road is straight runs and is turned half way round onto itself; the
// others are free meanders (control points, smoothed) that are NOT symmetric: each side has its own ground, and the balance
// harness (alternating sides) and `board.test.ts` (open ground by each castle) keep that fair.

import { hypot } from './hypot';

/** The grid the roads were drawn on (cells). Every map is `GROW` times as wide and tall as that, so there is room between the bends for the buildings. */
export const DRAWN_COLS = 36;
export const DRAWN_ROWS = 55;
export const GROW = 2;
/** Extra cells of open ground on the east and west of the grown field, so the clearings between the road's bends and the woods at the edges have room for buildings. */
export const EDGE = 8;

export type Pt = readonly [number, number];

/** A road between two camps (a seat's castle each) on a map with more than two: from camp `a` to camp `b`, a dense polyline in cell centres. */
export interface RoadLink {
  /** What the player reads on the lane picker ("West road"): the way a unit sent along it goes. */
  name: string;
  a: number;
  b: number;
  points: readonly Pt[];
}

export interface RoadDef {
  id: string;
  /** The field's size in cells. */
  cols: number;
  rows: number;
  name: string;
  blurb: string;
  /** Cells whose centre is this near the road are road (a cell on a straight run: 0.5 is one wide, 1 is three). */
  halfWidth: number;
  /** The road as a dense polyline, castle to castle (on a map with more camps, the first of its `links`). */
  points: readonly Pt[];
  /**
   * Maps for co-op: one castle (camp) per seat, which seats are allies (`teams`, as many as camps) and the roads between camps of
   * different teams, which fork and cross on the way (`board.ts` makes a lane of each, both ways). A map with none of these is a
   * duel: one road between two castles.
   */
  camps?: readonly Pt[];
  teams?: readonly number[];
  links?: readonly RoadLink[];
  /** The whole field (roads, camps, scenery) is turned half way round onto itself, so the two teams have the same ground. */
  turned?: boolean;
  /** What each seat earns, as a multiple (default 1 each): a computer side that stands alone against two people is paid more. */
  pace?: readonly number[];
}

/** A smooth curve through the control points (Catmull-Rom), sampled about every half cell. */
export function smooth(controls: readonly Pt[], step = 0.5): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number) => controls[Math.min(controls.length - 1, Math.max(0, i))]!;
  for (let i = 0; i < controls.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const n = Math.max(2, Math.ceil(hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
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

const DUEL_ROADS: readonly RoadDef[] = [
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

// --- Maps for co-op ------------------------------------------------------------------------------------------------------------
// One camp (castle) per seat, the two sides' camps apart, and roads that FORK on the way between them: a unit sent from a camp may
// take any road that leads to a foe's, so a side holds each fork or splits its armies. A road is built from pieces (a `piece` is a
// smooth curve through a few corners) joined end to end; pieces that two roads share are the same cells, which is what makes a
// fork. A road between two camps becomes two lanes (`board.ts`), one each way. The two-against-two fields are turned half way round
// onto themselves (so are their roads), the two-against-one fields are mirrored left to right (the lone side stands on the line).

/** The pieces of a road joined end to end (a shared corner is kept once). */
const join = (...pieces: readonly (readonly Pt[])[]): Pt[] => pieces.flatMap((p, i) => (i === 0 ? [...p] : p.slice(1)));
const piece = (...corners: Pt[]) => smooth(corners);
const reversed = (p: readonly Pt[]): Pt[] => [...p].reverse();
const [NCOLS, NROWS] = [120, 112];
/** A point turned half way round the field, or mirrored left to right. */
const turned = (p: Pt): Pt => [NCOLS - p[0], NROWS - p[1]];
const flipped = (p: Pt): Pt => [NCOLS - p[0], p[1]];

const network = (
  id: string,
  name: string,
  blurb: string,
  camps: readonly Pt[],
  teams: readonly number[],
  links: readonly RoadLink[],
  turn: boolean,
  pace?: readonly number[],
): RoadDef => ({
  id,
  cols: NCOLS,
  rows: NROWS,
  name,
  blurb,
  halfWidth: 1,
  points: links[0]!.points,
  camps,
  teams,
  links,
  turned: turn,
  pace,
});

/** Four camps in the corners: seats 0 and 1 on top (one side), 2 and 3 below (the other). */
const CORNERS: readonly [Pt, Pt, Pt, Pt] = [
  [22.5, 14.5],
  [97.5, 14.5],
  [22.5, 97.5],
  [97.5, 97.5],
];

/** Two roads cross in the middle, and each camp's road forks just outside its gate: straight down the edge, or across the field. */
const crossroads = (): RoadDef => {
  const [j0, j1, j2, j3]: [Pt, Pt, Pt, Pt] = [
    [22.5, 30.5],
    [97.5, 30.5],
    [22.5, 81.5],
    [97.5, 81.5],
  ];
  const stemA0 = piece(CORNERS[0], [22.5, 22.5], j0);
  const stemA1 = stemA0.map(flipped);
  const stemB3 = reversed(stemA0.map(turned)); // j3 down to the camp
  const stemB2 = stemB3.map(flipped);
  const west = piece(j0, [13, 36], [8, 46], [15, 54], [9, 63], [14, 72], j2);
  const east = reversed(west.map(turned));
  const cross1 = piece(j0, [33, 35], [45, 39], [54, 47], [60, 56], [66, 65], [75, 73], [87, 77], j3);
  const cross2 = cross1.map(flipped);
  void j1;
  return network(
    'crossroads',
    'Crossroads (2 v 2)',
    'Four camps and two ways down for each: the edge road, or the crossing in the middle where every army meets.',
    CORNERS,
    [0, 0, 1, 1],
    [
      { name: 'West road', a: 0, b: 2, points: join(stemA0, west, stemB2) },
      { name: 'Cross to the south-east', a: 0, b: 3, points: join(stemA0, cross1, stemB3) },
      { name: 'East road', a: 1, b: 3, points: join(stemA1, east, stemB3) },
      { name: 'Cross to the south-west', a: 1, b: 2, points: join(stemA1, cross2, stemB2) },
    ],
    true,
  );
};

/** One road down each edge and a bridge between them half way: an army may go straight on or cross, and the bridge is the fight. */
const hbridge = (): RoadDef => {
  const [mL, mR]: [Pt, Pt] = [
    [22.5, 56],
    [97.5, 56],
  ];
  const westTop = piece(CORNERS[0], [15, 25], [26, 36], [16, 46], mL);
  const eastTop = westTop.map(flipped);
  const eastBottom = reversed(westTop.map(turned)); // mR down to the camp
  const westBottom = eastBottom.map(flipped);
  const bar = piece(mL, [38, 62], [50, 52], [60, 56], [70, 60], [82, 50], mR);
  return network(
    'hbridge',
    'The Bridge (2 v 2)',
    'A road down each edge and one bridge across the middle: hold the bridge, or run the edge.',
    CORNERS,
    [0, 0, 1, 1],
    [
      { name: 'West road', a: 0, b: 2, points: join(westTop, westBottom) },
      { name: 'Over the bridge', a: 0, b: 3, points: join(westTop, bar, eastBottom) },
      { name: 'East road', a: 1, b: 3, points: join(eastTop, eastBottom) },
      { name: 'Over the bridge', a: 1, b: 2, points: join(eastTop, reversed(bar), westBottom) },
    ],
    true,
  );
};

/** Two camps up top against one at the bottom of the field, on the line down the middle. */
const TRIO: readonly [Pt, Pt, Pt] = [
  [22.5, 14.5],
  [97.5, 14.5],
  [60, 97.5],
];

/** Each camp has a long road round its own side and a short one down the middle, where the two sides' roads merge into one road to the lone camp. */
const twinfords = (): RoadDef => {
  const j0: Pt = [22.5, 30.5];
  const stemA0 = piece(TRIO[0], [22.5, 22.5], j0);
  const stemA1 = stemA0.map(flipped);
  const outerW = piece(j0, [12, 38], [8, 50], [14, 62], [9, 74], [18, 85], [32, 92], [46, 95], TRIO[2]);
  const outerE = outerW.map(flipped);
  const centreW = piece(j0, [34, 38], [46, 44], [54, 54], [60, 62]);
  const centreE = centreW.map(flipped);
  const trunk = piece([60, 62], [60, 80], TRIO[2]);
  return network(
    'twinfords',
    'Twin Fords (2 v 1)',
    'Two camps against one. Each of you has a long road round your side and a short one down the middle, where the roads merge.',
    TRIO,
    [0, 0, 1],
    [
      { name: 'West road', a: 0, b: 2, points: join(stemA0, outerW) },
      { name: 'Down the middle', a: 0, b: 2, points: join(stemA0, centreW, trunk) },
      { name: 'East road', a: 1, b: 2, points: join(stemA1, outerE) },
      { name: 'Down the middle', a: 1, b: 2, points: join(stemA1, centreE, trunk) },
    ],
    false,
    // Balanced against two computers on its side (tools/towercraftCoop.ts): the lone side earns about 1.9 times what each of them does (`npm run towercraft:coop`).
    [1, 1, 1.9],
  );
};

/** A road down each of the two camps' sides, a bridge that joins them, and from the bridge either straight on to the lone camp or down the middle. */
const delta = (): RoadDef => {
  const mL: Pt = [22.5, 58];
  const mid: Pt = [60, 62];
  const westTop = piece(TRIO[0], [14, 24], [26, 36], [14, 47], mL);
  const eastTop = westTop.map(flipped);
  const barW = piece(mL, [34, 66], [46, 56], mid);
  const barE = barW.map(flipped);
  const diagW = piece(mL, [14, 70], [24, 82], [38, 88], [48, 96], TRIO[2]);
  const diagE = diagW.map(flipped);
  const trunk = piece(mid, [60, 80], TRIO[2]);
  return network(
    'delta',
    'The Delta (2 v 1)',
    'Two camps against one. Your roads run down the sides and may turn in to the middle, where they join the way to the lone camp.',
    TRIO,
    [0, 0, 1],
    [
      { name: 'Down the side', a: 0, b: 2, points: join(westTop, diagW) },
      { name: 'Turn to the middle', a: 0, b: 2, points: join(westTop, barW, trunk) },
      { name: 'Down the side', a: 1, b: 2, points: join(eastTop, diagE) },
      { name: 'Turn to the middle', a: 1, b: 2, points: join(eastTop, barE, trunk) },
    ],
    false,
    [1, 1, 1.5],
  );
};

/** The maps for more than two seats (the title screen offers them by how many play). */
export const COOP_ROADS: readonly RoadDef[] = [crossroads(), hbridge(), twinfords(), delta()];

/** Every map: the duels (one road between two castles) first, then the co-op fields. */
export const ROADS: readonly RoadDef[] = [...DUEL_ROADS, ...COOP_ROADS];
