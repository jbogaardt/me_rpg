// The open-air world: one grid of biomes, each its own zone, cut from a single picture so their borders always meet.
//
// `maps/world.ts` lays the biomes out as a character grid (one character = `square` x `square` cells) and lists the
// gaps between them. Every biome is a `maps/<name>.ts` that default-exports `defineBiome(...)` and builds in *world*
// cells. `buildWorld` then:
//   1. walls every biome in: `WALL` cells of its own trees along every border it shares with another biome (and along
//      the edge of the world), except where a gap opens a corridor through both walls;
//   2. puts a door on each side of every gap: each corridor cell next to the border leads straight across, to the
//      cell `WALL - 1` cells into the other biome (so it arrives inside the other corridor, facing on);
//   3. runs every biome's spec, composes them into one world (each cell from the biome that owns it; see
//      `Zone.compose`) and cuts each biome's map out of it: its own cells plus `MARGIN` cells of its neighbours, which
//      are drawn exactly as they are but blocked. So the wall seen across a border is the neighbour's real wall, and
//      the two sides of a border cannot disagree.
// `checkSeams` (tools/map/check.ts) then proves it on the generated maps: along every border both sides are walled,
// or both are doors to each other, and no one can walk off the world.

import { CELL, type DoorSpawn, type MapData } from '../../src/map/types';
import { PREFABS, type PrefabName } from './catalog';
import type { ClimateName } from '../../src/systems/weather';
import type { TerrainName } from './terrain';
import { fbm, maskRects, noise, smoothMask } from './noise';
import { rng, SURFACES, Zone, type Rect, type WoodsOptions, type ZoneApi } from './zone';

/** Cells of trees on each side of a border between two biomes (and along the world's edge). */
export const WALL = 3;
/**
 * Cells of the neighbours a biome's map includes around its own: more than half of the widest usual view (40 cells at
 * 1280 px wide, 20 each side) plus the walls, so a player at a wall never sees past the drawn map.
 */
export const MARGIN = 22;
/**
 * Cells past a gap's border where a player arrives (the first, the neighbour's own door cell, would send them straight
 * back): at the very edge of the new screen, as if they had just walked on, since the camera stops at the border.
 */
export const ARRIVE = 1;
/** Up to this many cells thicker than `WALL` a wall swells where the noise says so, so its inner edge is ragged. */
export const RAGGED = 3;
/** Default width of a gap (cells). */
export const GAP = 3;

export type Side = 'n' | 's' | 'e' | 'w';
const STEP: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const DIR: Record<Side, NonNullable<DoorSpawn['dir']>> = { n: 'up', s: 'down', e: 'right', w: 'left' };
const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * An opening between two neighbouring squares of the layout: the square at `at` (layout column, row) and the one on
 * its `side`. It is `w` cells wide (default 3), starting `offset` cells along that edge (default: centred).
 */
export interface Gap {
  at: [number, number];
  side: Side;
  w?: number;
  offset?: number;
}

export interface WorldLayout {
  square: number; // world cells per layout character
  rows: string[]; // the layout, one string per row of squares, one character per square
  key: Record<string, string>; // layout character -> biome (zone) name
  gaps: Gap[];
  /**
   * How far (in squares) the borders wander from the square grid, so they look carved rather than stepped (default
   * 0.7; 0 keeps the squares). They stay straight across the gaps.
   */
  wobble?: number;
  seed?: number; // changes the borders' wander (default 1)
}

/** What a biome spec can do: the usual zone calls (in world cells), plus where it is and a scatter helper. */
export interface BiomeApi extends ZoneApi {
  /** The biome's own cells' bounding box (world cells). */
  readonly bounds: Rect;
  /** Is this world cell the biome's? */
  owns(col: number, row: number): boolean;
  /** Is this cell the biome's, outside its walls and gaps, and not yet taken by something the spec placed or blocked? */
  free(col: number, row: number): boolean;
  /** Keep scattered props off these cells (roads, plazas, a frozen lake...); points may still go there. */
  keepClear(area: Rect | Rect[]): void;
  /**
   * Lay the biome's ground terrain over its own cells, but stop short of the borders: the terrain's edge lies between
   * `inset[0]` and `inset[1]` cells from the nearest other biome (default 3 to 7, wandering with noise), so the shared
   * ground shows between it and the wall and the two grounds on either side of a border never meet in a straight line.
   */
  ground(name: TerrainName, opts?: { inset?: [number, number]; scale?: number; seed?: number }): void;
  /** How far (cells) an own cell is from the nearest other biome or the edge of the world (0 outside the biome). */
  borderDistance(col: number, row: number): number;
  /**
   * The free cell (see `free`) nearest (col, row): where to put a mob, chest or the spawn so that it lands in the
   * biome's open ground however its border wanders. Throws if there is none within 30 cells.
   */
  near(col: number, row: number): [number, number];
  /**
   * Sprinkle props over the free cells of `rect` (default: the whole biome), deterministically: `count` of them, each
   * a random pick of `names`, with at least `margin` free cells around each (default 1, 2 for trees, so paths stay open and crowns do not clump).
   * `where` filters cells further (e.g. only on sand).
   */
  scatter(
    names: PrefabName[],
    opts: { count: number; rect?: Rect; seed?: number; margin?: number; where?: (col: number, row: number) => boolean },
  ): void;
}

export interface BiomeSpec {
  name: string;
  /** The biome's weather (a key of CLIMATES, systems/weather.ts): snow only in the frost, sandstorms in the desert... */
  climate: ClimateName;
  /** What its walls are made of: trees, and bushes and rocks for the corners no tree fits (`WoodsOptions`). */
  walls: WoodsOptions;
  /** Wall the edge of the world too (default true). False when the spec closes that edge itself, e.g. with the sea. */
  worldEdge?: boolean;
  build(z: BiomeApi): void;
}

export const defineBiome = (spec: BiomeSpec) => spec;

const worlds = new WeakMap<WorldLayout, World>();
/** The `World` of a layout, made once (specs use it to find their gaps: `worldOf(layout).gap('town', 'greenwood')`). */
export function worldOf(layout: WorldLayout): World {
  let w = worlds.get(layout);
  if (!w) worlds.set(layout, (w = new World(layout)));
  return w;
}

/**
 * Who owns each world cell: the layout's squares, with the borders wandering (`wobble`) so they look carved. Each cell
 * looks up the square at a point pushed about by smooth noise, except near a gap, where the push fades out so the
 * border runs straight across the corridor. Then every biome is made one piece: a stray island is given to whoever
 * surrounds it.
 */
function carve(layout: WorldLayout, names: string[]): Int16Array {
  const { rows, square: S, key } = layout;
  const W = rows[0].length * S,
    H = rows.length * S;
  const amp = (layout.wobble ?? 0.7) * S;
  const seed = layout.seed ?? 1;
  // Three octaves: broad bends, bays and headlands, and a little roughness.
  const octave = (n: number) => [
    noise(seed * 11 + n, S * 1.1),
    noise(seed * 11 + n + 3, S * 0.45),
    noise(seed * 11 + n + 6, S * 0.18),
  ];
  const nx = octave(1),
    ny = octave(2);
  const push = (f: ((x: number, y: number) => number)[], x: number, y: number) =>
    (f[0](x, y) * 0.62 + f[1](x, y) * 0.3 + f[2](x, y) * 0.08) * 1.8; // value noise rarely reaches its peaks
  // Where the gaps cross a border (cell coordinates of the middle of each), and how far round them the border is calm.
  const calm = layout.gaps.map((g) => {
    const [dx, dy] = STEP[g.side];
    const w = g.w ?? GAP;
    const along = (g.offset ?? Math.floor((S - w) / 2)) + w / 2;
    return {
      x: dx ? g.at[0] * S + (dx > 0 ? S : 0) : g.at[0] * S + along,
      y: dy ? g.at[1] * S + (dy > 0 ? S : 0) : g.at[1] * S + along,
      r0: w / 2 + WALL + 3,
    };
  });
  const owner = new Int16Array(W * H);
  const sq = (x: number, y: number) =>
    names.indexOf(
      key[
        rows[Math.min(rows.length - 1, Math.max(0, Math.floor(y / S)))][
          Math.min(rows[0].length - 1, Math.max(0, Math.floor(x / S)))
        ]
      ],
    );
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const x = col + 0.5,
        y = row + 0.5;
      let k = 1;
      for (const c of calm) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < c.r0 + S * 0.6) k = Math.min(k, Math.max(0, (d - c.r0) / (S * 0.6)));
      }
      k = k * k * (3 - 2 * k);
      const dx = push(nx, x, y) * amp * k;
      const dy = push(ny, x, y) * amp * k;
      owner[row * W + col] = sq(x + dx, y + dy);
    }
  }
  // Smooth away spikes and pinholes: each cell takes the most common owner round it (twice). A straight border, like
  // the one across a gap, stays as it is.
  for (let pass = 0; pass < 2; pass++) {
    const prev = owner.slice();
    const votes = new Int32Array(names.length);
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        votes.fill(0);
        for (let r = Math.max(0, row - 2); r <= Math.min(H - 1, row + 2); r++)
          for (let c = Math.max(0, col - 2); c <= Math.min(W - 1, col + 2); c++) votes[prev[r * W + c]]++;
        let best = prev[row * W + col];
        for (let k = 0; k < names.length; k++) if (votes[k] > votes[best]) best = k;
        owner[row * W + col] = best;
      }
    }
  }
  // One piece per biome: every part but the biggest goes to the biome that borders it most.
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Int32Array(W * H).fill(-1);
    const parts: { k: number; cells: number[] }[] = [];
    for (let i = 0; i < W * H; i++) {
      if (seen[i] >= 0) continue;
      const k = owner[i];
      const cells = [i];
      seen[i] = parts.length;
      for (let j = 0; j < cells.length; j++) {
        const c = cells[j];
        const cx = c % W;
        for (const n of [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, c - W, c + W]) {
          if (n < 0 || n >= W * H || seen[n] >= 0 || owner[n] !== k) continue;
          seen[n] = parts.length;
          cells.push(n);
        }
      }
      parts.push({ k, cells });
    }
    const biggest = new Map<number, number>();
    parts.forEach((p, i) => {
      const b = biggest.get(p.k);
      if (b === undefined || parts[b].cells.length < p.cells.length) biggest.set(p.k, i);
    });
    let changed = false;
    parts.forEach((p, i) => {
      if (biggest.get(p.k) === i) return;
      const votes = new Map<number, number>();
      for (const c of p.cells) {
        const cx = c % W;
        for (const n of [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, c - W, c + W])
          if (n >= 0 && n < W * H && owner[n] !== p.k) votes.set(owner[n], (votes.get(owner[n]) ?? 0) + 1);
      }
      const to = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (to === undefined) return;
      for (const c of p.cells) owner[c] = to;
      changed = true;
    });
    if (!changed) break;
  }
  return owner;
}

/** The layout as a grid of owners, and where each biome's map is cut. Pure geometry: no art, no specs. */
export class World {
  readonly width: number;
  readonly height: number;
  readonly names: string[]; // biome names, index = owner id
  readonly owner: Int16Array; // per world cell: index into `names`
  private crops = new Map<string, Rect>();

  constructor(readonly layout: WorldLayout) {
    const { rows, square: S, key } = layout;
    const cols = rows[0]?.length ?? 0;
    rows.forEach((r, i) => {
      if (r.length !== cols) throw new Error(`world layout row ${i} is ${r.length} squares wide, not ${cols}`);
      for (const ch of r) if (!key[ch]) throw new Error(`world layout row ${i}: "${ch}" is not in the key`);
    });
    this.names = [...new Set(Object.values(key))];
    this.width = cols * S;
    this.height = rows.length * S;
    this.owner = carve(layout, this.names);
    for (const [k, name] of this.names.entries()) {
      let c0 = Infinity,
        r0 = Infinity,
        c1 = -1,
        r1 = -1;
      for (let i = 0; i < this.owner.length; i++) {
        if (this.owner[i] !== k) continue;
        const c = i % this.width,
          r = Math.floor(i / this.width);
        [c0, r0, c1, r1] = [Math.min(c0, c), Math.min(r0, r), Math.max(c1, c), Math.max(r1, r)];
      }
      if (c1 < 0) throw new Error(`biome ${name} owns no cells`);
      const col = Math.max(0, c0 - MARGIN),
        row = Math.max(0, r0 - MARGIN);
      this.crops.set(name, {
        col,
        row,
        w: Math.min(this.width, c1 + 1 + MARGIN) - col,
        h: Math.min(this.height, r1 + 1 + MARGIN) - row,
      });
    }
  }

  /** The biome a layout square was drawn as (before the borders wander). */
  squareOwner(sx: number, sy: number): number {
    const ch = this.layout.rows[sy]?.[sx];
    return ch === undefined ? -1 : this.names.indexOf(this.layout.key[ch]);
  }

  ownerAt(col: number, row: number): number {
    return col < 0 || row < 0 || col >= this.width || row >= this.height ? -1 : this.owner[row * this.width + col];
  }

  /** The rect of world cells biome `name`'s map is cut from. */
  crop(name: string): Rect {
    const r = this.crops.get(name);
    if (!r) throw new Error(`unknown biome ${name}`);
    return r;
  }

  /**
   * The gap between biomes `a` and `b` (the `n`th if they share several): its corridor's cells on `a`'s side, `WALL`
   * deep, as a rect. A road that should lead through it runs into this rect.
   */
  gap(a: string, b: string, n = 0): Rect {
    const S = this.layout.square;
    const found = this.layout.gaps.filter((g) => {
      const [dx, dy] = STEP[g.side];
      const one = this.names[this.squareOwner(g.at[0], g.at[1])];
      const two = this.names[this.squareOwner(g.at[0] + dx, g.at[1] + dy)];
      return (one === a && two === b) || (one === b && two === a);
    });
    const g = found[n];
    if (!g) throw new Error(`no gap ${n} between ${a} and ${b}`);
    const [dx, dy] = STEP[g.side];
    const fromA = this.names[this.squareOwner(g.at[0], g.at[1])] === a;
    const [sx, sy] = fromA ? g.at : [g.at[0] + dx, g.at[1] + dy];
    const side = fromA ? g.side : OPPOSITE[g.side];
    const w = g.w ?? GAP;
    const offset = g.offset ?? Math.floor((S - w) / 2);
    if (side === 'n') return { col: sx * S + offset, row: sy * S, w, h: WALL };
    if (side === 's') return { col: sx * S + offset, row: sy * S + S - WALL, w, h: WALL };
    if (side === 'w') return { col: sx * S, row: sy * S + offset, w: WALL, h: w };
    return { col: sx * S + S - WALL, row: sy * S + offset, w: WALL, h: w };
  }

  /** A biome as text: `#` its walls, `=` its gaps, `.` open ground, blank not its own; rulers every 10 world cells. */
  sketch(name: string): string {
    const k = this.names.indexOf(name);
    if (k < 0) throw new Error(`unknown biome ${name}`);
    const crop = this.crop(name);
    // The biome's own box: the crop less the margin, where the world allowed one.
    const r = {
      col: crop.col && crop.col + MARGIN,
      row: crop.row && crop.row + MARGIN,
      w: 0,
      h: 0,
    };
    r.w = Math.min(this.width, crop.col + crop.w) - (crop.col + crop.w < this.width ? MARGIN : 0) - r.col;
    r.h = Math.min(this.height, crop.row + crop.h) - (crop.row + crop.h < this.height ? MARGIN : 0) - r.row;
    const { corridor, approach } = this.gaps();
    const walls = this.wall(k, true, corridor, approach);
    const lines: string[] = [];
    const cols = Array.from({ length: r.w }, (_, i) => r.col + i);
    const tens = cols.map(() => ' ');
    cols.forEach((c, i) => {
      if (c % 10 === 0) [...String(c)].forEach((ch, j) => i + j < tens.length && (tens[i + j] = ch));
    });
    lines.push('      ' + tens.join(''));
    lines.push('      ' + cols.map((c) => String(c % 10)).join(''));
    for (let row = r.row; row < r.row + r.h; row++) {
      let line = String(row).padStart(4) + '  ';
      for (const col of cols) {
        const i = row * this.width + col;
        line += this.owner[i] !== k ? ' ' : corridor.has(i) ? '=' : walls[i] ? '#' : '.';
      }
      if (line.trim().length > String(row).length) lines.push(line.trimEnd());
    }
    return lines.join('\n');
  }

  /** A world cell in biome `name`'s own map cells (what a door into it names). */
  toLocal(name: string, col: number, row: number) {
    const r = this.crop(name);
    return { col: col - r.col, row: row - r.row };
  }

  /**
   * Every gap as cells: the open corridor through both walls, the cells just past it that must stay clear, and the
   * doors on each side (world cells, destination in the other biome's own cells).
   */
  gaps() {
    const S = this.layout.square;
    const corridor = new Set<number>();
    const approach = new Set<number>();
    const doors: {
      zone: string;
      col: number;
      row: number;
      to: { zone: string; col: number; row: number };
      dir: DoorSpawn['dir'];
    }[] = [];
    for (const g of this.layout.gaps) {
      const [sx, sy] = g.at;
      const [dx, dy] = STEP[g.side];
      const a = this.squareOwner(sx, sy);
      const b = this.squareOwner(sx + dx, sy + dy);
      const where = `gap at square (${sx},${sy}) ${g.side}`;
      if (a < 0 || b < 0) throw new Error(`${where} leads off the world`);
      if (a === b) throw new Error(`${where} is inside ${this.names[a]}; a gap joins two biomes`);
      const w = g.w ?? GAP;
      const offset = g.offset ?? Math.floor((S - w) / 2);
      if (offset < 0 || offset + w > S) throw new Error(`${where} does not fit its square's edge`);
      for (let k = 0; k < w; k++) {
        // The cell of A on the border, then step across.
        const along = offset + k;
        const ac = dx ? sx * S + (dx > 0 ? S - 1 : 0) : sx * S + along;
        const ar = dy ? sy * S + (dy > 0 ? S - 1 : 0) : sy * S + along;
        for (let d = -WALL; d < WALL; d++) corridor.add((ar + dy * (d + 1)) * this.width + ac + dx * (d + 1));
        for (let d = WALL; d < WALL + 4; d++)
          for (const side of [-1, 0, 1]) {
            for (const sign of [1, -1]) {
              const s = sign > 0 ? d : -d - 1;
              approach.add((ar + dy * (s + 1) + dx * side) * this.width + ac + dx * (s + 1) + dy * side);
            }
          }
        const bc = ac + dx,
          br = ar + dy;
        const [nameA, nameB] = [this.names[a], this.names[b]];
        doors.push({
          zone: nameA,
          col: ac,
          row: ar,
          to: { zone: nameB, ...this.toLocal(nameB, bc + dx * ARRIVE, br + dy * ARRIVE) },
          dir: DIR[g.side],
        });
        doors.push({
          zone: nameB,
          col: bc,
          row: br,
          to: { zone: nameA, ...this.toLocal(nameA, ac - dx * ARRIVE, ar - dy * ARRIVE) },
          dir: DIR[OPPOSITE[g.side]],
        });
      }
    }
    for (const i of corridor) approach.delete(i);
    return { corridor, approach, doors };
  }

  /**
   * For each cell of biome `k`, its distance (cells, a chamfer approximation of the straight-line one) to the nearest
   * cell of another biome, or to the edge of the world when `edge`; 0 for cells that are not the biome's.
   */
  borderDistance(k: number, edge: boolean): Float32Array {
    const { width: W, height: H } = this;
    const dist = new Float32Array(W * H);
    const BIG = 1e6;
    for (let i = 0; i < dist.length; i++) dist[i] = this.owner[i] === k ? BIG : 0;
    if (edge) {
      for (let c = 0; c < W; c++) for (const r of [0, H - 1]) if (this.owner[r * W + c] === k) dist[r * W + c] = 1;
      for (let r = 0; r < H; r++) for (const c of [0, W - 1]) if (this.owner[r * W + c] === k) dist[r * W + c] = 1;
    }
    const D = Math.SQRT2;
    const relax = (i: number, c: number, r: number, dc: number, dr: number, cost: number) => {
      const nc = c + dc,
        nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H) return;
      const v = dist[nr * W + nc] + cost;
      if (v < dist[i]) dist[i] = v;
    };
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (this.owner[i] !== k) continue;
        relax(i, c, r, -1, 0, 1);
        relax(i, c, r, 0, -1, 1);
        relax(i, c, r, -1, -1, D);
        relax(i, c, r, 1, -1, D);
      }
    for (let r = H - 1; r >= 0; r--)
      for (let c = W - 1; c >= 0; c--) {
        const i = r * W + c;
        if (this.owner[i] !== k) continue;
        relax(i, c, r, 1, 0, 1);
        relax(i, c, r, 0, 1, 1);
        relax(i, c, r, 1, 1, D);
        relax(i, c, r, -1, 1, D);
      }
    return dist;
  }

  /**
   * Biome `k`'s wall cells: its cells within `WALL` of another biome (or of the world's edge, if `edge`) and a ragged
   * extra of up to `RAGGED` cells where the noise swells it, so the inner edge of a wall has lobes and bays rather than
   * running dead straight along a straight border. `dist` is `borderDistance(k, edge)`.
   */
  wall(
    k: number,
    edge: boolean,
    corridor: Set<number>,
    approach: Set<number> = new Set(),
    dist: Float32Array = this.borderDistance(k, edge),
  ): Uint8Array {
    const out = new Uint8Array(this.width * this.height);
    const swell = fbm(k * 53 + 7, 9);
    const foreign = (c: number, r: number) => {
      const o = this.ownerAt(c, r);
      return (o < 0 && edge) || (o >= 0 && o !== k);
    };
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const i = row * this.width + col;
        if (this.owner[i] !== k || corridor.has(i)) continue;
        // Just past a gap the way stays open (unless the cell is on a border itself), even near a bend of a border.
        if (
          approach.has(i) &&
          ![
            [col + 1, row],
            [col - 1, row],
            [col, row + 1],
            [col, row - 1],
          ].some(([c, r]) => foreign(c, r))
        )
          continue;
        const extra = RAGGED * Math.max(0, swell(col, row)) ** 1.3;
        if (dist[i] <= WALL + 0.25 + extra) out[i] = 1;
      }
    }
    return out;
  }
}

/** A biome's view of the world zone it builds into: forwards every call and remembers what it took up. */
class BiomeWindow implements BiomeApi {
  readonly bounds: Rect;
  private taken: Uint8Array; // something stands there (or the gaps need it)
  private clear: Uint8Array; // keep scattered props off it (roads, plazas...)

  constructor(
    private z: Zone,
    private world: World,
    private k: number,
    private walls: Uint8Array,
    reserved: Set<number>,
    private dist: Float32Array,
  ) {
    this.taken = new Uint8Array(world.width * world.height);
    this.clear = new Uint8Array(world.width * world.height);
    for (const i of reserved) if (i >= 0 && i < this.taken.length) this.taken[i] = 1;
    let c0 = Infinity,
      r0 = Infinity,
      c1 = -1,
      r1 = -1;
    for (let i = 0; i < world.owner.length; i++) {
      if (world.owner[i] !== k) continue;
      const c = i % world.width,
        r = Math.floor(i / world.width);
      [c0, r0, c1, r1] = [Math.min(c0, c), Math.min(r0, r), Math.max(c1, c), Math.max(r1, r)];
    }
    this.bounds = { col: c0, row: r0, w: c1 - c0 + 1, h: r1 - r0 + 1 };
  }

  get width() {
    return this.z.width;
  }
  get height() {
    return this.z.height;
  }
  owns(col: number, row: number) {
    return this.world.ownerAt(col, row) === this.k;
  }
  /** Free, and not kept clear: where scatter may put things. */
  private roomy(col: number, row: number) {
    return this.free(col, row) && !this.clear[row * this.world.width + col];
  }
  free(col: number, row: number) {
    const i = row * this.world.width + col;
    return this.owns(col, row) && !this.walls[i] && !this.taken[i];
  }
  private take(r: Rect) {
    for (let row = r.row; row < r.row + r.h; row++)
      for (let col = r.col; col < r.col + r.w; col++)
        if (col >= 0 && row >= 0 && col < this.world.width && row < this.world.height)
          this.taken[row * this.world.width + col] = 1;
  }
  borderDistance(col: number, row: number): number {
    return this.dist[row * this.world.width + col] ?? 0;
  }
  ground(name: TerrainName, opts: { inset?: [number, number]; scale?: number; seed?: number } = {}) {
    const [lo, hi] = opts.inset ?? [WALL, WALL + 4];
    const edge = fbm(opts.seed ?? this.k * 97 + name.length * 13 + 3, opts.scale ?? 14);
    const b = this.bounds;
    const mask = new Uint8Array(b.w * b.h);
    for (let r = 0; r < b.h; r++)
      for (let c = 0; c < b.w; c++) {
        const col = b.col + c,
          row = b.row + r;
        if (!this.owns(col, row)) continue;
        const reach = lo + (hi - lo) * Math.min(1, Math.max(0, (edge(col, row) + 1) / 2));
        mask[r * b.w + c] = this.borderDistance(col, row) >= reach ? 1 : 0;
      }
    const smooth = smoothMask(mask, b.w, b.h, 2);
    this.z.paint(
      name,
      maskRects((col, row) => smooth[(row - b.row) * b.w + (col - b.col)] === 1 && this.owns(col, row), b),
    );
  }
  /** Is any cell within `pad` of (col, row) kept clear (a road, a plaza...)? */
  private nearClear(col: number, row: number, pad: number): boolean {
    for (let dr = -pad; dr <= pad; dr++)
      for (let dc = -pad; dc <= pad; dc++) {
        const c = col + dc,
          r = row + dr;
        if (c >= 0 && r >= 0 && c < this.world.width && r < this.world.height && this.clear[r * this.world.width + c])
          return true;
      }
    return false;
  }
  near(col: number, row: number): [number, number] {
    for (let d = 0; d <= 30; d++)
      for (let dr = -d; dr <= d; dr++)
        for (let dc = -d; dc <= d; dc++)
          if (Math.max(Math.abs(dr), Math.abs(dc)) === d && this.free(col + dc, row + dr)) return [col + dc, row + dr];
    throw new Error(`${this.world.names[this.k]}: no free cell near (${col},${row})`);
  }
  keepClear(area: Rect | Rect[]) {
    for (const r of Array.isArray(area) ? area : [area])
      for (let row = r.row; row < r.row + r.h; row++)
        for (let col = r.col; col < r.col + r.w; col++)
          if (col >= 0 && row >= 0 && col < this.world.width && row < this.world.height)
            this.clear[row * this.world.width + col] = 1;
  }
  private takePoint(col: number, row: number) {
    this.take({ col: col - 1, row: row - 1, w: 3, h: 3 });
  }
  /** The cells a prop at (col, row) stands on: its width, and its bottom two rows (the rest is walk-behind). */
  private footprint(name: PrefabName, col: number, row: number): Rect {
    const p = PREFABS[name];
    const h = p.solid ? Math.min(2, Math.ceil(p.h / CELL)) : 1;
    return { col, row: row - h + 1, w: Math.ceil(p.w / CELL), h };
  }

  fill(...a: Parameters<Zone['fill']>) {
    this.z.fill(...a);
  }
  patch(...a: Parameters<Zone['patch']>) {
    this.z.patch(...a);
  }
  paint(...a: Parameters<Zone['paint']>) {
    this.z.paint(...a);
  }
  stamp(...a: Parameters<Zone['stamp']>) {
    this.z.stamp(...a);
  }
  glare(...a: Parameters<Zone['glare']>) {
    this.z.glare(...a);
  }
  prop(name: PrefabName, col: number, row: number, nudge?: { dx?: number; dy?: number }) {
    this.z.prop(name, col, row, nudge);
    this.take(this.footprint(name, col, row));
  }
  forest(rect: Rect, opts?: { seed?: number; trees?: PrefabName[] }) {
    this.z.forest(rect, opts);
    this.take(rect);
  }
  grove(area: Rect | Rect[], opts?: WoodsOptions) {
    // Its own cells only, and not over anything placed already (a mob, a chest, the spawn), the gaps' ways through, or a
    // road (kept clear, with a cell of verge: a wood never grows onto a path).
    const cells = new Set<number>();
    for (const r of Array.isArray(area) ? area : [area])
      for (let row = r.row; row < r.row + r.h; row++)
        for (let col = r.col; col < r.col + r.w; col++)
          if (this.free(col, row) && !this.nearClear(col, row, 1)) cells.add(row * this.world.width + col);
    this.z.woods((c, r) => cells.has(r * this.world.width + c), opts);
    for (const i of cells) this.taken[i] = 1;
  }
  plateau(rect: Rect, opts?: Parameters<Zone['plateau']>[1]) {
    this.z.plateau(rect, opts);
    this.take({ col: rect.col - 1, row: rect.row - 1, w: rect.w + 2, h: rect.h + 4 });
  }
  block(rect: Rect, reason: string) {
    this.z.block(rect, reason);
    this.take(rect);
  }
  unblock(rect: Rect) {
    this.z.unblock(rect);
  }
  spawn(col: number, row: number) {
    this.z.spawn(col, row);
    this.takePoint(col, row);
  }
  npc(col: number, row: number) {
    this.z.npc(col, row);
    this.takePoint(col, row);
  }
  mob(kind: string, col: number, row: number) {
    this.z.mob(kind, col, row);
    this.takePoint(col, row);
  }
  chest(kind: string, loot: string, col: number, row: number) {
    this.z.chest(kind, loot, col, row);
    this.takePoint(col, row);
  }
  shop(shop: string, col: number, row: number) {
    this.z.shop(shop, col, row);
    this.takePoint(col, row);
  }
  pet(kind: string, col: number, row: number) {
    this.z.pet(kind, col, row);
    this.takePoint(col, row);
  }
  giver(giver: string, col: number, row: number) {
    this.z.giver(giver, col, row);
    this.takePoint(col, row);
  }
  site(kind: string, col: number, row: number) {
    this.z.site(kind, col, row);
    this.takePoint(col, row);
  }
  place(name: string, col: number, row: number) {
    this.z.place(name, col, row); // a label only: it takes no room
  }
  door(col: number, row: number, w: number, toZone: string, toCol: number, toRow: number) {
    this.z.door(col, row, w, toZone, toCol, toRow);
    this.take({ col: col - 1, row: row - 1, w: w + 2, h: 3 });
  }
  indoor() {
    throw new Error('a biome is open air; rooms are their own zones (maps/shop_*.ts)');
  }
  climate(name: ClimateName) {
    this.z.climate(name);
  }
  scatter(
    names: PrefabName[],
    opts: { count: number; rect?: Rect; seed?: number; margin?: number; where?: (col: number, row: number) => boolean },
  ) {
    const r = opts.rect ?? this.bounds;
    // Big crowns need air between them: a tree keeps 2 free cells round its feet unless told otherwise.
    const m = opts.margin ?? (names.some((n) => PREFABS[n].tag === 'tree') ? 2 : 1);
    const rand = rng(opts.seed ?? r.col * 31 + r.row * 977 + opts.count * 7 + names.length);
    const cells: [number, number][] = [];
    for (let row = r.row; row < r.row + r.h; row++)
      for (let col = r.col; col < r.col + r.w; col++) if (this.roomy(col, row)) cells.push([col, row]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    let placed = 0;
    for (const [col, row] of cells) {
      if (placed >= opts.count) break;
      const name = names[Math.floor(rand() * names.length)];
      const f = this.footprint(name, col, row);
      let ok = true;
      for (let y = f.row - m; y < f.row + f.h + m && ok; y++)
        for (let x = f.col - m; x < f.col + f.w + m && ok; x++)
          ok = this.roomy(x, y) && (!opts.where || opts.where(x, y));
      // A tall prop's top rows hang over the cells above its feet: they must not hang over a road either.
      const above = Math.ceil(PREFABS[name].h / CELL) - f.h;
      for (let y = f.row - above; y < f.row && ok; y++)
        for (let x = f.col; x < f.col + f.w && ok; x++) ok = !this.nearClear(x, y, 0);
      if (!ok) continue;
      this.prop(name, col, row);
      placed++;
    }
    if (placed < opts.count)
      console.log(
        `  ! ${this.world.names[this.k]}: scatter placed ${placed} of ${opts.count} (${names.join('/')}); not enough room`,
      );
  }
}

export interface BuiltZone {
  data: MapData;
  reasons: Map<number, string>;
}

/** Build every biome of `layout` (specs by name) into one world and cut out each biome's map. */
export function buildWorld(layout: WorldLayout, specs: BiomeSpec[]): Map<string, BuiltZone> {
  const world = new World(layout);
  const byName = new Map(specs.map((s) => [s.name, s]));
  for (const name of world.names)
    if (!byName.has(name)) throw new Error(`world layout names biome "${name}" but maps/${name}.ts is missing`);
  for (const s of specs)
    if (!world.names.includes(s.name))
      throw new Error(`maps/${s.name}.ts is a biome, but the world layout has no "${s.name}"`);
  const { width: W, height: H } = world;
  const gaps = world.gaps();
  const reserved = new Set([...gaps.corridor, ...gaps.approach]);

  const zones = world.names.map((name, k) => {
    const spec = byName.get(name)!;
    const edge = spec.worldEdge ?? true;
    const z = new Zone(W, H);
    z.climate(spec.climate);
    const dist = world.borderDistance(k, edge);
    const walls = world.wall(k, edge, gaps.corridor, gaps.approach, dist);
    // The wall: its own trees over every wall cell, running on 3 cells past the world's edge so no gap shows there.
    z.woods(
      (c, r) => {
        if (c >= 0 && r >= 0 && c < W && r < H) return walls[r * W + c] === 1;
        const out = Math.max(-c, -r, c - W + 1, r - H + 1);
        return (
          edge && out <= 3 && world.ownerAt(Math.min(W - 1, Math.max(0, c)), Math.min(H - 1, Math.max(0, r))) === k
        );
      },
      {
        ...spec.walls,
        seed: k * 7919 + 1,
        // The row along the border blocks whatever stands on it: no slipping between two walls.
        hard: (c, r) =>
          [
            [c + 1, r],
            [c - 1, r],
            [c, r + 1],
            [c, r - 1],
          ].some(([nc, nr]) => {
            const o = world.ownerAt(nc, nr);
            return (o < 0 && edge) || (o >= 0 && o !== k);
          }),
      },
    );
    for (const d of gaps.doors) if (d.zone === name) z.door(d.col, d.row, 1, d.to.zone, d.to.col, d.to.row, d.dir);
    spec.build(new BiomeWindow(z, world, k, walls, reserved, dist));
    return z;
  });

  const merged = Zone.compose(W, H, world.owner, zones);
  const full = merged.toMapData();
  const out = new Map<string, BuiltZone>();
  world.names.forEach((name, k) => out.set(name, cut(world, full, merged.reasons, zones[k], k, merged.soft)));
  return out;
}

/** Biome `k`'s map: its crop of the composed world, the neighbours blocked, its own points moved to the crop's cells. */
function cut(
  world: World,
  full: MapData,
  reasons: Map<number, string>,
  zone: Zone,
  k: number,
  soft: Map<number, boolean>,
): BuiltZone {
  const name = world.names[k];
  const r = world.crop(name);
  const W = world.width;
  // How far each world cell is from the biome (in cells, 8-way), up to MARGIN + 1: further away is never on screen.
  const far = MARGIN + 1;
  const dist = new Uint8Array(world.owner.length).fill(far);
  let frontier: number[] = [];
  world.owner.forEach((o, i) => {
    if (o === k) {
      dist[i] = 0;
      frontier.push(i);
    }
  });
  for (let d = 1; d < far && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const c = i % W,
        row = Math.floor(i / W);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc,
            nr = row + dr;
          if (nc < 0 || nr < 0 || nc >= W || nr >= world.height) continue;
          const j = nr * W + nc;
          if (dist[j] > d) {
            dist[j] = d;
            next.push(j);
          }
        }
    }
    frontier = next;
  }

  const sheets: string[] = [];
  const sheetIndex = (s: number) => {
    const n = full.sheets[s];
    const i = sheets.indexOf(n);
    return i >= 0 ? i : sheets.push(n) - 1;
  };
  const cells = r.w * r.h;
  const ground = new Array<MapData['ground'][number]>(cells).fill(null);
  const surface = new Array<number>(cells).fill(0);
  const level = new Array<number>(cells).fill(0);
  const collision: number[] = [];
  const ramps: number[] = [];
  const localReasons = new Map<number, string>();
  const blocked = new Set(full.collision);
  const rampSet = new Set(full.ramps);
  const beyond = SURFACES.indexOf('beyond');
  for (let row = 0; row < r.h; row++) {
    for (let col = 0; col < r.w; col++) {
      const i = row * r.w + col;
      const wi = (row + r.row) * W + col + r.col;
      const g = full.ground[wi];
      if (g && dist[wi] < far) {
        const layers = [...g];
        for (let j = 0; j < layers.length; j += 3) layers[j] = sheetIndex(layers[j]);
        ground[i] = layers as typeof g;
      }
      const own = world.owner[wi] === k;
      surface[i] = own ? full.surface[wi] : beyond;
      level[i] = full.level[wi];
      if (own && rampSet.has(wi)) ramps.push(i);
      if (!own || blocked.has(wi)) collision.push(i);
      const why = own ? reasons.get(wi) : 'a neighbouring biome';
      if (why) localReasons.set(i, why);
    }
  }
  const x0 = r.col * CELL,
    y0 = r.row * CELL;
  const objects = full.objects
    .filter((o) => {
      if (o.px + o.w <= x0 || o.py + o.h <= y0 || o.px >= x0 + r.w * CELL || o.py >= y0 + r.h * CELL) return false;
      const c = Math.min(W - 1, Math.max(0, Math.floor((o.px + o.w / 2) / CELL)));
      const rr = Math.min(world.height - 1, Math.max(0, Math.floor((o.py + o.h - 1) / CELL)));
      return dist[rr * W + c] < far;
    })
    .map((o) => ({ ...o, s: sheetIndex(o.s), px: o.px - x0, py: o.py - y0 }));

  const e = zone.entities();
  if (!e.spawn) throw new Error(`biome ${name} has no spawn(); every zone needs one (checks flood from it)`);
  // A pocket of open ground closed off by woods and props (no way in from the spawn) is part of them: block it.
  const blockedHere = new Set(collision);
  const rampHere = new Set(ramps);
  const seen = new Uint8Array(cells);
  const start = (e.spawn.row - r.row) * r.w + e.spawn.col - r.col;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const c = i % r.w;
    for (const j of [c > 0 ? i - 1 : -1, c < r.w - 1 ? i + 1 : -1, i - r.w, i + r.w]) {
      if (j < 0 || j >= cells || seen[j] || blockedHere.has(j)) continue;
      if (level[j] !== level[i] && !rampHere.has(i) && !rampHere.has(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  for (let i = 0; i < cells; i++) {
    if (seen[i] || blockedHere.has(i)) continue;
    const wi = (Math.floor(i / r.w) + r.row) * W + (i % r.w) + r.col;
    if (world.owner[wi] !== k) continue;
    collision.push(i);
    localReasons.set(i, soft.has(wi) ? 'woods' : 'enclosed');
  }
  collision.sort((a, b) => a - b);
  const local = <T extends { col: number; row: number }>(p: T): T => ({ ...p, col: p.col - r.col, row: p.row - r.row });
  const data: MapData = {
    version: 2,
    width: r.w,
    height: r.h,
    sheets,
    ground,
    objects,
    collision,
    surfaces: SURFACES,
    surface,
    level,
    ramps,
    spawn: local(e.spawn),
    npc: e.npc && local(e.npc),
    mobs: e.mobs.map(local),
    chests: e.chests.map(local),
    shops: e.shops.map(local),
    pets: e.pets.map(local),
    givers: e.givers.map(local),
    sites: e.sites.map(local),
    places: e.places.map(local),
    doors: e.doors.map(local),
    indoor: false,
    climate: e.climate,
  };
  // Points must stand on the biome's own cells.
  const stray: [string, { col: number; row: number }][] = [
    ['spawn', e.spawn],
    ...(e.npc ? [['npc', e.npc] as [string, { col: number; row: number }]] : []),
    ...e.mobs.map((m): [string, typeof m] => [`mob ${m.kind}`, m]),
    ...e.chests.map((c): [string, typeof c] => [`chest ${c.loot}`, c]),
    ...e.shops.map((s): [string, typeof s] => [`shop ${s.shop}`, s]),
    ...e.pets.map((p): [string, typeof p] => [`pet ${p.kind}`, p]),
    ...e.givers.map((g): [string, typeof g] => [`quest giver ${g.giver}`, g]),
    ...e.sites.map((s): [string, typeof s] => [`quest site ${s.kind}`, s]),
    ...e.places.map((s): [string, typeof s] => [`place ${s.name}`, s]),
    ...e.doors.map((d): [string, typeof d] => [`door to ${d.to.zone}`, d]),
  ];
  stray.splice(0, stray.length, ...stray.filter(([, p]) => world.ownerAt(p.col, p.row) !== k));
  if (stray.length)
    throw new Error(
      `biome ${name}: ${stray.map(([what, p]) => `${what} at world (${p.col},${p.row})`).join(', ')} is outside its own cells`,
    );
  return { data, reasons: localReasons };
}
