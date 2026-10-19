// The maps (Pixi-free): each is ONE road from player 0's castle to player 1's across a tall field (road.ts has the game's roads'
// shapes, scenery.ts the cells woods, lakes and rocks cover on each). Units of player 0 walk the road from its start, player 1's
// from its end, so they meet somewhere between. Positions are in cells (a cell's centre is at +0.5); a distance is cells along
// the road from its start. Towers go on the free cells beside the road. A match carries its board (`Match.board`); the game plays
// the maps in `BOARDS` (each has a picture), `maps.ts` has more for balance runs.
// A board's road is either corners of straight runs (`waypoints`, one cell wide: the balance maps) or a dense polyline in cell
// centres (`points`, `halfWidth` cells either side: the game's maps, which wander freely).

import { hypot } from './hypot';
import { COLS, ROADS, ROWS, type Pt, type RoadLink } from './road';
import { SCENERY } from './scenery';

export { COLS, ROWS };

const centre = ([c, r]: readonly [number, number]): [number, number] => [c + 0.5, r + 0.5];

/** What makes a map: its size, the road and the cells nothing is built on. */
export interface BoardSpec {
  cols: number;
  rows: number;
  /** The road's corners (first is player 0's castle, last player 1's); ignored when `points` is given. */
  waypoints: readonly (readonly [number, number])[];
  /** Cells (`row * cols + col`) woods, lakes and rocks cover. */
  scenery: readonly number[];
  /** Name, shown on the title screen, for a map the game offers. */
  id?: string;
  name?: string;
  blurb?: string;
  /** The road as a dense polyline in cell centres, and how wide it is (cells either side of it whose centre is that near). */
  points?: readonly Pt[];
  halfWidth?: number;
  /** A map for more than two seats: where each seat's castle (camp) stands, who is on whose side and the roads between foes (see `RoadDef`). */
  camps?: readonly Pt[];
  teams?: readonly number[];
  links?: readonly RoadLink[];
  turned?: boolean;
  pace?: readonly number[];
}

/** Where the road is nearest a tower, measured square to the road there (so a unit can step straight off it). */
export interface Foot {
  /** Cells along the road from its start to the point on it straight across from the tower. */
  s: number;
  /** Cells between that point on the road and the tower's centre. */
  d: number;
  /** The way off the road toward the tower (a unit vector, square to the road: never a slant). */
  dir: [number, number];
}

/**
 * One way along a road, from one seat's castle to a foe's: a unit of that seat walks it from its start. Every road makes two (one
 * each way), so a map with forks and crossings is a list of lanes and a unit only ever asks its own. Distances are cells walked from
 * the lane's start.
 */
export interface Lane {
  /** Its place in `Board.lanes`. */
  id: number;
  /** The seat whose units walk it, and the seat whose castle it ends at. */
  from: number;
  to: number;
  /** Shown on the lane picker. */
  name: string;
  points: readonly Pt[];
  length: number;
  pointAt: (dist: number) => [number, number];
  directionAt: (dist: number) => [number, number];
  headingAt: (dist: number) => 'up' | 'down' | 'left' | 'right';
  footOf: (col: number, row: number) => Foot | undefined;
}

/** A map ready to play on: the spec plus everything the rules ask of it. A match carries its board (`Match.board`). */
export interface Board {
  id: string;
  name: string;
  blurb: string;
  cols: number;
  rows: number;
  waypoints: BoardSpec['waypoints'];
  points?: readonly Pt[];
  halfWidth?: number;
  /** How many seats (castles) it has, and which side each is on (a duel: two seats, two sides). */
  seats: number;
  teams: readonly number[];
  /** The ways a unit may walk, each from a seat's castle to a foe's. A duel has two: the road each way. */
  lanes: readonly Lane[];
  /** The lane a seat's units take unless told another (its first). */
  homeLane: readonly number[];
  /** The whole field is turned half way round onto itself (the two sides have the same ground). */
  turned: boolean;
  /** What each seat earns as a multiple of the castle's pay (all 1 unless a lone side stands against two). */
  pace: readonly number[];
  /** The first lane's length in cells: the road of a duel. */
  roadLength: number;
  /** How far (cells) an air unit flies between the castles: the straight line. */
  airLength: number;
  /** Where each seat's castle stands (cell centre, in cells). */
  castles: readonly [[number, number], [number, number], ...[number, number][]];
  /** Every cell the road covers, as `row * cols + col`. */
  roadCells: ReadonlySet<number>;
  sceneryCells: ReadonlySet<number>;
  /** Where a unit that has walked `dist` cells from the first lane's start is (clamped to the road). */
  pointAt: (dist: number) => [number, number];
  /** Which way (in the road's own direction, start to end) the road mostly runs at `dist`. */
  headingAt: (dist: number) => 'up' | 'down' | 'left' | 'right';
  /** The same as a unit vector, for a road that is not made of straight runs along the axes. */
  directionAt: (dist: number) => [number, number];
  /** The road point straight across from a cell (square to the road there), or nothing at a castle: where a unit leaves the road for a tower. */
  footOf: (col: number, row: number) => Foot | undefined;
  cellIndex: (col: number, row: number) => number;
  inBoard: (col: number, row: number) => boolean;
}

/** The cells within `halfWidth` of the polyline (measured from each cell's centre). */
function cellsNear(points: readonly Pt[], halfWidth: number, cols: number, rows: number): Set<number> {
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
    for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++)
      for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
        const t = Math.min(1, Math.max(0, ((c + 0.5 - a[0]) * dx + (r + 0.5 - a[1]) * dy) / len2));
        if (hypot(c + 0.5 - (a[0] + dx * t), r + 0.5 - (a[1] + dy * t)) <= halfWidth + 1e-9) cells.add(r * cols + c);
      }
  }
  return cells;
}

/** A road polyline made walkable: distances along it, the way it runs, and where a tower's foot on it is. */
function makeLane(id: number, from: number, to: number, name: string, points: readonly Pt[], cols: number): Lane {
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1]! + hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const length = cum[cum.length - 1]!;
  const feet = new Map<number, Foot | null>();
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
  const directionAt = (dist: number): [number, number] => {
    const i = segment(Math.min(Math.max(0, dist), length));
    const [a, b] = [points[i]!, points[i + 1]!];
    const run = hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / run, (b[1] - a[1]) / run];
  };
  return {
    id,
    from,
    to,
    name,
    points,
    length,
    pointAt: (dist) => {
      const d = Math.min(Math.max(0, dist), length);
      const i = segment(d);
      const [a, b] = [points[i]!, points[i + 1]!];
      const run = cum[i + 1]! - cum[i]!;
      const t = run === 0 ? 0 : (d - cum[i]!) / run;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
    directionAt,
    headingAt: (dist) => {
      const [dx, dy] = directionAt(dist);
      return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
    },
    footOf: (col, row) => {
      const key = row * cols + col;
      if (feet.has(key)) return feet.get(key) ?? undefined;
      const [tx, ty] = [col + 0.5, row + 0.5];
      let best: Foot | null = null;
      for (let i = 0; i < points.length - 1; i++) {
        const [a, b] = [points[i]!, points[i + 1]!];
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.min(1, Math.max(0, ((tx - a[0]) * dx + (ty - a[1]) * dy) / len2));
        const [px, py] = [a[0] + dx * t, a[1] + dy * t];
        const d = hypot(tx - px, ty - py);
        if (d > 0 && (!best || d < best.d))
          best = { s: cum[i]! + t * Math.sqrt(len2), d, dir: [(tx - px) / d, (ty - py) / d] };
      }
      feet.set(key, best);
      return best ?? undefined;
    },
  };
}

export function makeBoard(spec: BoardSpec): Board {
  const { cols, rows, waypoints } = spec;
  const points: readonly Pt[] = spec.points ?? waypoints.map(centre);
  // A duel is one road between two castles; a map for more seats is a list of roads between camps of different sides.
  const links: readonly RoadLink[] = spec.links ?? [{ name: 'The road', a: 0, b: 1, points }];
  const camps: readonly Pt[] = spec.camps ?? [points[0]!, points[points.length - 1]!];
  const teams = spec.teams ?? camps.map((_, i) => i);
  const lanes: Lane[] = [];
  for (const link of links) {
    lanes.push(makeLane(lanes.length, link.a, link.b, link.name, link.points, cols));
    lanes.push(makeLane(lanes.length, link.b, link.a, link.name, [...link.points].reverse(), cols));
  }
  const first = lanes[0]!;
  const castles = camps.map((c): [number, number] => [c[0], c[1]]) as unknown as Board['castles'];
  let roadCells: Set<number>;
  if (spec.points || spec.links) {
    roadCells = new Set<number>();
    for (const link of links) for (const c of cellsNear(link.points, spec.halfWidth ?? 1, cols, rows)) roadCells.add(c);
  } else {
    roadCells = new Set<number>();
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [c0, r0] = waypoints[i]!;
      const [c1, r1] = waypoints[i + 1]!;
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
        for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) roadCells.add(r * cols + c);
    }
  }
  return {
    id: spec.id ?? 'map',
    name: spec.name ?? spec.id ?? 'Map',
    blurb: spec.blurb ?? '',
    cols,
    rows,
    waypoints,
    points: spec.points,
    halfWidth: spec.halfWidth,
    seats: castles.length,
    teams,
    lanes,
    homeLane: castles.map((_, seat) =>
      Math.max(
        0,
        lanes.findIndex((l) => l.from === seat),
      ),
    ),
    turned: !!spec.turned,
    pace: castles.map((_, i) => spec.pace?.[i] ?? 1),
    roadLength: first.length,
    airLength: hypot(castles[1][0] - castles[0][0], castles[1][1] - castles[0][1]),
    castles,
    roadCells,
    sceneryCells: new Set(spec.scenery),
    pointAt: first.pointAt,
    directionAt: first.directionAt,
    headingAt: first.headingAt,
    footOf: first.footOf,
    cellIndex: (col, row) => row * cols + col,
    inBoard: (col, row) =>
      Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < cols && row < rows,
  };
}

/** The lane a unit walks: its own, or its seat's first when none is named. */
export const laneOf = (board: Board, u: { owner: number; lane?: number }): Lane =>
  board.lanes[u.lane ?? board.homeLane[u.owner]!]!;

/** The lanes a seat's units may take, and the seat each leads to. */
export const lanesFrom = (board: Board, seat: number): readonly Lane[] => board.lanes.filter((l) => l.from === seat);

/** The maps the game offers, by id (each has a picture, `art/maps/<id>.png`). */
export const BOARDS: Readonly<Record<string, Board>> = Object.fromEntries(
  ROADS.map((def) => [
    def.id,
    makeBoard({
      cols: def.cols,
      rows: def.rows,
      waypoints: [],
      scenery: SCENERY[def.id] ?? [],
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      points: def.points,
      halfWidth: def.halfWidth,
      camps: def.camps,
      teams: def.teams,
      links: def.links,
      turned: def.turned ?? def.id === 'greenwood',
      pace: def.pace,
    }),
  ]),
);
export const BOARD_IDS = ROADS.map((r) => r.id);
/** The maps for a match of this many seats: two is a duel, three is two against one, four two against two. */
export const boardIdsFor = (seats: number) => BOARD_IDS.filter((id) => BOARDS[id]!.seats === seats);
export const DEFAULT_BOARD_ID = 'greenwood';

/** The classic map: the sim's default board (and `maps.ts`'s `serpent`). */
export const DEFAULT_BOARD: Board = BOARDS[DEFAULT_BOARD_ID]!;

// The default board's parts, for the renderer and the tests.
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
