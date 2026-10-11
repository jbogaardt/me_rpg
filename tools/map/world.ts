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
import { rng, SURFACES, Zone, type Rect, type ZoneApi } from './zone';

/** Cells of trees on each side of a border between two biomes (and along the world's edge). */
export const WALL = 3;
/**
 * Cells of the neighbours a biome's map includes around its own: enough to see well past the walls (the camera stops at
 * the map's edge, so on a very wide screen the view simply stops scrolling a little before the border).
 */
export const MARGIN = 14;
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
}

/** What a biome spec can do: the usual zone calls (in world cells), plus where it is and a scatter helper. */
export interface BiomeApi extends ZoneApi {
  /** The biome's own cells' bounding box (world cells). */
  readonly bounds: Rect;
  /** Is this world cell the biome's? */
  owns(col: number, row: number): boolean;
  /** Is this cell the biome's, outside its walls and gaps, and not yet taken by something the spec placed? */
  free(col: number, row: number): boolean;
  /** Keep these cells free of scattered props (roads, plazas, a frozen lake...). */
  keepClear(area: Rect | Rect[]): void;
  /**
   * Sprinkle props over the free cells of `rect` (default: the whole biome), deterministically: `count` of them, each
   * a random pick of `names`, with at least `margin` free cells around each (default 1, so paths stay open).
   * `where` filters cells further (e.g. only on sand).
   */
  scatter(
    names: PrefabName[],
    opts: { count: number; rect?: Rect; seed?: number; margin?: number; where?: (col: number, row: number) => boolean },
  ): void;
}

export interface BiomeSpec {
  name: string;
  /** The trees of its walls. */
  walls: { trees: PrefabName[] };
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
    this.owner = new Int16Array(this.width * this.height);
    for (let row = 0; row < this.height; row++)
      for (let col = 0; col < this.width; col++)
        this.owner[row * this.width + col] = this.names.indexOf(key[rows[Math.floor(row / S)][Math.floor(col / S)]]);
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
      const one = this.names[this.ownerAt(g.at[0] * S, g.at[1] * S)];
      const two = this.names[this.ownerAt((g.at[0] + dx) * S, (g.at[1] + dy) * S)];
      return (one === a && two === b) || (one === b && two === a);
    });
    const g = found[n];
    if (!g) throw new Error(`no gap ${n} between ${a} and ${b}`);
    const [dx, dy] = STEP[g.side];
    const fromA = this.names[this.ownerAt(g.at[0] * S, g.at[1] * S)] === a;
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
    const { corridor } = this.gaps();
    const walls = this.wall(k, true, corridor);
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
      const a = this.ownerAt(sx * S, sy * S);
      const b = this.ownerAt((sx + dx) * S, (sy + dy) * S);
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
        for (let d = WALL; d < WALL + 3; d++)
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
          to: { zone: nameB, ...this.toLocal(nameB, bc + dx * (WALL - 1), br + dy * (WALL - 1)) },
          dir: DIR[g.side],
        });
        doors.push({
          zone: nameB,
          col: bc,
          row: br,
          to: { zone: nameA, ...this.toLocal(nameA, ac - dx * (WALL - 1), ar - dy * (WALL - 1)) },
          dir: DIR[OPPOSITE[g.side]],
        });
      }
    }
    for (const i of corridor) approach.delete(i);
    return { corridor, approach, doors };
  }

  /** Biome `k`'s wall cells: its cells within WALL of another biome (or of the world's edge, if `edge`). */
  wall(k: number, edge: boolean, corridor: Set<number>): Uint8Array {
    const out = new Uint8Array(this.width * this.height);
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const i = row * this.width + col;
        if (this.owner[i] !== k || corridor.has(i)) continue;
        search: for (let dr = -WALL; dr <= WALL; dr++) {
          for (let dc = -WALL; dc <= WALL; dc++) {
            const o = this.ownerAt(col + dc, row + dr);
            if ((o < 0 && edge) || (o >= 0 && o !== k)) {
              out[i] = 1;
              break search;
            }
          }
        }
      }
    }
    return out;
  }
}

/**
 * Cover a cell mask with few, large rectangles (they may overlap): each uncovered cell, in reading order, gets the
 * largest rectangle inside the mask that contains it.
 */
export function coverRects(mask: Uint8Array, width: number, height: number): Rect[] {
  const at = (c: number, r: number) => c >= 0 && r >= 0 && c < width && r < height && mask[r * width + c] === 1;
  const left = new Int32Array(mask.length),
    right = new Int32Array(mask.length);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) left[r * width + c] = at(c, r) ? (at(c - 1, r) ? left[r * width + c - 1] : c) : 0;
    for (let c = width - 1; c >= 0; c--)
      right[r * width + c] = at(c, r) ? (at(c + 1, r) ? right[r * width + c + 1] : c) : 0;
  }
  const covered = new Uint8Array(mask.length);
  const rects: Rect[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!at(c, r) || covered[r * width + c]) continue;
      let best: Rect = { col: c, row: r, w: 1, h: 1 };
      let L1 = left[r * width + c],
        R1 = right[r * width + c];
      for (let t = r; t >= 0 && at(c, t); t--) {
        if (t < r) {
          L1 = Math.max(L1, left[t * width + c]);
          R1 = Math.min(R1, right[t * width + c]);
        }
        let L = L1,
          R = R1;
        for (let b = r; b < height && at(c, b); b++) {
          if (b > r) {
            L = Math.max(L, left[b * width + c]);
            R = Math.min(R, right[b * width + c]);
          }
          const area = (R - L + 1) * (b - t + 1);
          if (area > best.w * best.h) best = { col: L, row: t, w: R - L + 1, h: b - t + 1 };
        }
      }
      rects.push(best);
      for (let y = best.row; y < best.row + best.h; y++)
        for (let x = best.col; x < best.col + best.w; x++) covered[y * width + x] = 1;
    }
  }
  return rects;
}

/** A biome's view of the world zone it builds into: forwards every call and remembers what it took up. */
class BiomeWindow implements BiomeApi {
  readonly bounds: Rect;
  private taken: Uint8Array;

  constructor(
    private z: Zone,
    private world: World,
    private k: number,
    private walls: Uint8Array,
    reserved: Set<number>,
  ) {
    this.taken = new Uint8Array(world.width * world.height);
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
  keepClear(area: Rect | Rect[]) {
    for (const r of Array.isArray(area) ? area : [area]) this.take(r);
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
  door(col: number, row: number, w: number, toZone: string, toCol: number, toRow: number) {
    this.z.door(col, row, w, toZone, toCol, toRow);
    this.take({ col: col - 1, row: row - 1, w: w + 2, h: 3 });
  }
  indoor() {
    throw new Error('a biome is open air; rooms are their own zones (maps/shop_*.ts)');
  }
  scatter(
    names: PrefabName[],
    opts: { count: number; rect?: Rect; seed?: number; margin?: number; where?: (col: number, row: number) => boolean },
  ) {
    const r = opts.rect ?? this.bounds;
    const m = opts.margin ?? 1;
    const rand = rng(opts.seed ?? r.col * 31 + r.row * 977 + opts.count * 7 + names.length);
    const cells: [number, number][] = [];
    for (let row = r.row; row < r.row + r.h; row++)
      for (let col = r.col; col < r.col + r.w; col++) if (this.free(col, row)) cells.push([col, row]);
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
          ok = this.free(x, y) && (!opts.where || opts.where(x, y));
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
    const walls = world.wall(k, edge, gaps.corridor);
    for (const r of coverRects(walls, W, H)) {
      // Run walls on the world's edge 3 cells past it, so no gap shows at the edge of the screen.
      const grow = (touch: boolean) => (touch ? 3 : 0);
      const n = grow(r.row === 0),
        w = grow(r.col === 0),
        s = grow(r.row + r.h === H),
        e = grow(r.col + r.w === W);
      z.forest({ col: r.col - w, row: r.row - n, w: r.w + w + e, h: r.h + n + s }, { trees: spec.walls.trees });
    }
    for (const d of gaps.doors) if (d.zone === name) z.door(d.col, d.row, 1, d.to.zone, d.to.col, d.to.row, d.dir);
    spec.build(new BiomeWindow(z, world, k, walls, reserved));
    return z;
  });

  const merged = Zone.compose(W, H, world.owner, zones);
  const full = merged.toMapData();
  const out = new Map<string, BuiltZone>();
  world.names.forEach((name, k) => out.set(name, cut(world, full, merged.reasons, zones[k], k)));
  return out;
}

/** Biome `k`'s map: its crop of the composed world, the neighbours blocked, its own points moved to the crop's cells. */
function cut(world: World, full: MapData, reasons: Map<number, string>, zone: Zone, k: number): BuiltZone {
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
    doors: e.doors.map(local),
    indoor: false,
  };
  // Points must stand on the biome's own cells.
  const stray: [string, { col: number; row: number }][] = [
    ['spawn', e.spawn],
    ...(e.npc ? [['npc', e.npc] as [string, { col: number; row: number }]] : []),
    ...e.mobs.map((m): [string, typeof m] => [`mob ${m.kind}`, m]),
    ...e.chests.map((c): [string, typeof c] => [`chest ${c.loot}`, c]),
    ...e.shops.map((s): [string, typeof s] => [`shop ${s.shop}`, s]),
    ...e.doors.map((d): [string, typeof d] => [`door to ${d.to.zone}`, d]),
  ];
  stray.splice(0, stray.length, ...stray.filter(([, p]) => world.ownerAt(p.col, p.row) !== k));
  if (stray.length)
    throw new Error(
      `biome ${name}: ${stray.map(([what, p]) => `${what} at world (${p.col},${p.row})`).join(', ')} is outside its own cells`,
    );
  return { data, reasons: localReasons };
}
