import {
  CELL,
  FLAT_Z,
  type CellPoint,
  type ChestSpawn,
  type DoorSpawn,
  type ShopSpawn,
  type GroundCell,
  type MapData,
  type MapObject,
  type MobSpawn,
  type PetSpawn,
} from '../../src/map/types';
import {
  CLIFF,
  GROUND,
  PREFABS,
  RINGS,
  STAMPS,
  TREES,
  type CliffKind,
  type GroundName,
  type PrefabName,
  type StampName,
} from './catalog';
import { DEFAULT_CLIMATE, type ClimateName } from '../../src/systems/weather';
import { coverage, sheet as loadSheet } from './image';
import {
  decompose,
  TERRAIN_NAMES,
  TERRAIN_SHEET,
  TERRAINS,
  tileTable,
  variant,
  FULL,
  type TerrainDef,
  type TerrainName,
} from './terrain';

/** A rectangle of cells. May extend past the map edge (e.g. for border forests); it's clipped where needed. */
export interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

/** The builder calls a zone spec uses (a `Zone`, or a `WorldWindow` onto one). */
export interface ZoneApi {
  readonly width: number;
  readonly height: number;
  fill(name: GroundName, rect?: Rect): unknown;
  patch(name: GroundName, rect: Rect): unknown;
  paint(name: TerrainName, area: Rect | Rect[], opts?: { erase?: boolean }): unknown;
  stamp(name: StampName, col: number, row: number): unknown;
  prop(name: PrefabName, col: number, row: number, nudge?: { dx?: number; dy?: number }): unknown;
  forest(rect: Rect, opts?: { seed?: number; trees?: PrefabName[] }): unknown;
  grove(area: Rect | Rect[], opts?: WoodsOptions): unknown;
  plateau(rect: Rect, opts?: { kind?: CliffKind; stairs?: number[] }): unknown;
  block(rect: Rect, reason: string): unknown;
  unblock(rect: Rect): unknown;
  glare(col: number, row: number): unknown;
  spawn(col: number, row: number): unknown;
  npc(col: number, row: number): unknown;
  mob(kind: string, col: number, row: number): unknown;
  chest(kind: string, loot: string, col: number, row: number): unknown;
  shop(shop: string, col: number, row: number): unknown;
  pet(kind: string, col: number, row: number): unknown;
  door(col: number, row: number, w: number, toZone: string, toCol: number, toRow: number): unknown;
  indoor(): unknown;
  climate(name: ClimateName): unknown;
}

/** What a grove (or a biome's wall) is made of: trees, then bushes and rocks for the corners trees can't fill. */
export interface WoodsOptions {
  trees?: PrefabName[];
  fillers?: PrefabName[];
  seed?: number;
  /** Cells that block even where no art covers them (a biome's wall along its border: nobody slips through). */
  hard?: (col: number, row: number) => boolean;
  /** Fill every bare cell with a tree, bush or rock too (a dense thicket); by default only a wall's border row is. */
  fill?: boolean;
  /** Share of lattice spots a grove plants (default GROVE_DENSITY); walls always plant them all. */
  density?: number;
}

/** A wood's cell blocks when its art covers at least this much of it; barer cells at its edge stay walkable. */
export const SOFT_COVER = 0.2;

export interface ZoneSpec {
  name: string; // output: public/maps/<name>.json
  width: number;
  height: number;
  /**
   * Which cell of the world grid this zone's top-left cell sits on. With it, `build` uses world coordinates (the zones of
   * one open-air world line up on a shared grid, so an edge door at the same row on both sides really meets), and the
   * JSON is written in the zone's own cells (0,0 = its top-left). Door destinations (`toCol`, `toRow`) are always cells of
   * the destination zone's own grid.
   */
  origin?: { col: number; row: number };
  build(z: ZoneApi): void;
}

/** A `Zone` seen through a shifted window: every cell the spec names is a world cell, and lands `origin` cells earlier. */
export class WorldWindow implements ZoneApi {
  constructor(
    private z: Zone,
    private o: { col: number; row: number },
  ) {}
  get width() {
    return this.z.width;
  }
  get height() {
    return this.z.height;
  }
  private rect(r: Rect): Rect {
    return { ...r, col: r.col - this.o.col, row: r.row - this.o.row };
  }
  fill(name: GroundName, rect?: Rect) {
    this.z.fill(name, rect && this.rect(rect));
    return this;
  }
  patch(name: GroundName, rect: Rect) {
    this.z.patch(name, this.rect(rect));
    return this;
  }
  paint(name: TerrainName, area: Rect | Rect[], opts?: { erase?: boolean }) {
    this.z.paint(
      name,
      (Array.isArray(area) ? area : [area]).map((r) => this.rect(r)),
      opts,
    );
    return this;
  }
  stamp(name: StampName, col: number, row: number) {
    this.z.stamp(name, col - this.o.col, row - this.o.row);
    return this;
  }
  prop(name: PrefabName, col: number, row: number, nudge?: { dx?: number; dy?: number }) {
    this.z.prop(name, col - this.o.col, row - this.o.row, nudge);
    return this;
  }
  forest(rect: Rect, opts?: { seed?: number; trees?: PrefabName[] }) {
    this.z.forest(this.rect(rect), opts);
    return this;
  }
  grove(area: Rect | Rect[], opts?: WoodsOptions) {
    this.z.grove(
      (Array.isArray(area) ? area : [area]).map((r) => this.rect(r)),
      opts,
    );
    return this;
  }
  plateau(rect: Rect, opts: { kind?: CliffKind; stairs?: number[] } = {}) {
    this.z.plateau(this.rect(rect), { ...opts, stairs: opts.stairs?.map((c) => c - this.o.col) });
    return this;
  }
  block(rect: Rect, reason: string) {
    this.z.block(this.rect(rect), reason);
    return this;
  }
  unblock(rect: Rect) {
    this.z.unblock(this.rect(rect));
    return this;
  }
  glare(col: number, row: number) {
    this.z.glare(col - this.o.col, row - this.o.row);
    return this;
  }
  spawn(col: number, row: number) {
    this.z.spawn(col - this.o.col, row - this.o.row);
    return this;
  }
  npc(col: number, row: number) {
    this.z.npc(col - this.o.col, row - this.o.row);
    return this;
  }
  mob(kind: string, col: number, row: number) {
    this.z.mob(kind, col - this.o.col, row - this.o.row);
    return this;
  }
  chest(kind: string, loot: string, col: number, row: number) {
    this.z.chest(kind, loot, col - this.o.col, row - this.o.row);
    return this;
  }
  shop(shop: string, col: number, row: number) {
    this.z.shop(shop, col - this.o.col, row - this.o.row);
    return this;
  }
  pet(kind: string, col: number, row: number) {
    this.z.pet(kind, col - this.o.col, row - this.o.row);
    return this;
  }
  door(col: number, row: number, w: number, toZone: string, toCol: number, toRow: number) {
    this.z.door(col - this.o.col, row - this.o.row, w, toZone, toCol, toRow); // the destination is the other zone's own cell
    return this;
  }
  indoor() {
    this.z.indoor();
    return this;
  }
  climate(name: ClimateName) {
    this.z.climate(name);
    return this;
  }
}

/** Run a zone spec's `build` on `z`, through its origin window if it has one. */
export function buildSpec(spec: ZoneSpec, z: Zone) {
  spec.build(spec.origin ? new WorldWindow(z, spec.origin) : z);
}

/** Declare a zone. Files in maps/ default-export one of these; `npm run map -- build` turns it into JSON. */
export const defineZone = (spec: ZoneSpec) => spec;

/** Small deterministic PRNG so builds are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Surface names in the order stored in MapData.surfaces (a cell's `surface` indexes this): the grounds, what the
 * terrains are made of, and `beyond` (a cell of the neighbouring biome, seen but never walked; see world.ts).
 */
export const SURFACES: string[] = [
  ...new Set([...Object.keys(GROUND), ...Object.values(TERRAINS).map((t) => t.surface), 'beyond']),
];

/** A hand-placed object that isn't a catalog prefab (cliff pieces cut from a sheet). */
interface Extra {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
  tag: string;
  z: number;
}

interface Placed {
  prefab: PrefabName;
  px: number; // world top-left of the prefab box
  py: number;
  autoBlock: boolean; // derive collision from the art (props); forests block their rect instead
}

/**
 * Builder passed to a zone spec. Coordinates are cells unless named px/py. Later calls paint over
 * earlier ones, so lay down ground first, then features, then overrides.
 */
/** Spacing of the staggered lattice trees stand on in woods: wide enough that crowns overlap only a little. */
const WOOD_COL = 90;
const WOOD_ROW = 84;
const GROVE_DENSITY = 0.4; // share of lattice spots a grove plants

export class Zone {
  private ground: ({ sheet: string; x: number; y: number } | null)[];
  private placed: Placed[] = [];
  private extras: Extra[] = [];
  private surfaceAt: number[]; // per cell: index into SURFACES
  private levelAt: number[]; // per cell: height (0 = ground)
  private ramps = new Set<number>();
  private terrain = new Map<TerrainName, Uint8Array>(); // per terrain: which cell corners it covers, (w+1) x (h+1)
  private cellMasks = new Map<TerrainName, Uint8Array>(); // per terrain: fixed corner masks per cell (see compose)
  private blocked = new Set<number>();
  /** Cells of woods: blocked where their trees' art covers them (or always, when true), resolved in `toMapData`. */
  readonly soft = new Map<number, boolean>();
  private forced = new Map<number, boolean>(); // block()/unblock() overrides, applied last
  readonly reasons = new Map<number, string>(); // why a cell was blocked by hand (silences check warnings)
  private spawnAt: CellPoint | null = null;
  private npcAt: CellPoint | null = null;
  private mobList: MobSpawn[] = [];
  private chestList: ChestSpawn[] = [];
  private shopList: ShopSpawn[] = [];
  private petList: PetSpawn[] = [];
  private doorList: DoorSpawn[] = [];
  private isIndoor = false;
  private weather: ClimateName = DEFAULT_CLIMATE;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.ground = new Array<(typeof this.ground)[number]>(width * height).fill(null);
    this.surfaceAt = new Array<number>(width * height).fill(0);
    this.levelAt = new Array<number>(width * height).fill(0);
  }

  private inMap(col: number, row: number) {
    return col >= 0 && row >= 0 && col < this.width && row < this.height;
  }

  private cells(r: Rect): CellPoint[] {
    const out: CellPoint[] = [];
    for (let row = r.row; row < r.row + r.h; row++) {
      for (let col = r.col; col < r.col + r.w; col++) if (this.inMap(col, row)) out.push({ col, row });
    }
    return out;
  }

  private setGround(col: number, row: number, sheet: string, [x, y]: [number, number], surface?: GroundName) {
    if (!this.inMap(col, row)) return;
    this.ground[row * this.width + col] = { sheet, x, y };
    if (surface) this.surfaceAt[row * this.width + col] = SURFACES.indexOf(surface);
  }

  private fillTile(name: GroundName, col: number, row: number) {
    const g = GROUND[name];
    const line = g.tiles[row % g.tiles.length];
    this.setGround(col, row, g.sheet, line[col % line.length], name);
  }

  /** The ice tile with two glare lines on it: a shine in a lake's corner. Only meaningful on an ice patch. */
  glare(col: number, row: number) {
    this.setGround(col, row, GROUND.ice.sheet, [608, 96], 'ice');
    return this;
  }

  /**
   * Paint a terrain (see tools/map/terrain.ts) over the cells of `area`: they show it fully, and its soft edge reaches
   * half a cell past them, so any union of rects works (stepped borders, inner corners). `erase` takes it away again
   * (a path through a bog). Water-like terrains don't block by themselves: `block` the same rects.
   */
  paint(name: TerrainName, area: Rect | Rect[], opts: { erase?: boolean } = {}) {
    const W = this.width + 1;
    let v = this.terrain.get(name);
    if (!v) this.terrain.set(name, (v = new Uint8Array(W * (this.height + 1))));
    for (const r of Array.isArray(area) ? area : [area]) {
      const c0 = Math.max(0, r.col),
        r0 = Math.max(0, r.row);
      const c1 = Math.min(this.width, r.col + r.w),
        r1 = Math.min(this.height, r.row + r.h);
      for (let row = r0; row <= r1 && r1 > r0; row++)
        for (let col = c0; col <= c1 && c1 > c0; col++) v[row * W + col] = opts.erase ? 0 : 1;
    }
    return this;
  }

  /** The corner mask of `name` on a cell (bit 3 top-left .. bit 0 bottom-right). */
  private cornerMask(name: TerrainName, col: number, row: number): number {
    const fixed = this.cellMasks.get(name);
    if (fixed) return fixed[row * this.width + col];
    const v = this.terrain.get(name);
    if (!v) return 0;
    const W = this.width + 1;
    const i = row * W + col;
    return (v[i] << 3) | (v[i + 1] << 2) | (v[i + W] << 1) | v[i + W + 1];
  }

  /** Cover the whole map (or a rect) with a repeating ground. */
  fill(name: GroundName, rect: Rect = { col: 0, row: 0, w: this.width, h: this.height }) {
    for (const { col, row } of this.cells(rect)) this.fillTile(name, col, row);
    return this;
  }

  /**
   * A rectangular patch of ground over grass. If the ground has a ring in the catalog (sand does),
   * the patch's outermost cells become the blending edge/corner tiles, so the rect must be at least 3x3
   * and its visible fill is the inner (w-2)x(h-2).
   */
  patch(name: GroundName, rect: Rect) {
    const ring = RINGS[name];
    if (!ring) return this.fill(name, rect);
    if (rect.w < 3 || rect.h < 3) throw new Error(`patch(${name}) needs at least 3x3 cells for its edge ring`);
    const c1 = rect.col + rect.w - 1;
    const r1 = rect.row + rect.h - 1;
    for (const { col, row } of this.cells(rect)) {
      const n = row === rect.row,
        s = row === r1,
        w = col === rect.col,
        e = col === c1;
      const edge = n
        ? w
          ? ring.nw
          : e
            ? ring.ne
            : ring.n
        : s
          ? w
            ? ring.sw
            : e
              ? ring.se
              : ring.s
          : w
            ? ring.w
            : e
              ? ring.e
              : null;
      // Water/ice shores blend into sand/snow, so those ring cells keep the surface already there.
      if (edge) this.setGround(col, row, ring.sheet, edge, name === 'water' || name === 'ice' ? undefined : name);
      else this.fillTile(name, col, row);
    }
    return this;
  }

  /**
   * Copy a pre-painted ground decoration (see STAMPS) with its top-left cell at (col, row). Only source
   * cells that are fully opaque are copied, so irregular shapes stay irregular; everything else keeps
   * the ground underneath. Doesn't block movement.
   */
  stamp(name: StampName, col: number, row: number) {
    const st = STAMPS[name];
    const img = loadSheet(st.sheet);
    for (let j = 0; j < st.h / CELL; j++) {
      for (let i = 0; i < st.w / CELL; i++) {
        const sx = st.x + i * CELL,
          sy = st.y + j * CELL;
        let opaque = true;
        for (let y = sy; y < sy + CELL && opaque; y++) {
          for (let x = sx; x < sx + CELL; x++)
            if (img.data[(y * img.width + x) * 4 + 3] < 255) {
              opaque = false;
              break;
            }
        }
        if (opaque) this.setGround(col + i, row + j, st.sheet, [sx, sy], 'sand');
      }
    }
    return this;
  }

  /**
   * Place a prefab with the bottom-left cell of its footprint at (col, row): its bottom edge sits on
   * the bottom of `row`, and it's centred in the cells its width spans. dx/dy nudge it in pixels.
   * Collision comes from the art (see Prefab.solid), so don't block() props by hand.
   */
  prop(name: PrefabName, col: number, row: number, nudge: { dx?: number; dy?: number } = {}) {
    const p = PREFABS[name];
    const span = Math.ceil(p.w / CELL) * CELL;
    this.placed.push({
      prefab: name,
      px: col * CELL + Math.floor((span - p.w) / 2) + (nudge.dx ?? 0),
      py: (row + 1) * CELL - p.h + (nudge.dy ?? 0),
      autoBlock: true,
    });
    return this;
  }

  /**
   * Dense trees filling `rect`, which is blocked exactly. Canopies stay inside the rect except for
   * a ~18px walk-behind fringe poking out of its top edge. Extend the rect past the map edge for
   * borders so no gaps show at the edge of the world.
   */
  forest(rect: Rect, opts: { seed?: number; trees?: PrefabName[] } = {}) {
    const trees = opts.trees ?? TREES;
    const rand = rng(opts.seed ?? rect.col * 7919 + rect.row * 104729 + rect.w * 31 + rect.h);
    const { w: TW, h: TH } = PREFABS.treeA;
    const L = rect.col * CELL,
      R = (rect.col + rect.w) * CELL;
    const T = rect.row * CELL,
      B = (rect.row + rect.h) * CELL;
    const FRINGE = 18,
      ROW_STEP = 52,
      COL_STEP = 46;
    const bottomY = B - TH;
    const topY = Math.min(bottomY, T - FRINGE);
    const rows = Math.max(1, Math.ceil((bottomY - topY) / ROW_STEP) + 1);
    const cols = Math.max(1, Math.ceil((R - L - TW) / COL_STEP) + 1);
    const dx = cols > 1 ? (R - L - TW) / (cols - 1) : 0;
    for (let i = 0; i < rows; i++) {
      const py = Math.round(rows > 1 ? topY + ((bottomY - topY) * i) / (rows - 1) : bottomY);
      const stagger = i % 2 ? dx / 2 : 0;
      for (let j = 0; j < cols; j++) {
        const edge = j === 0 || j === cols - 1;
        // Outer trees sit exactly on the rect's sides; inner ones get a little jitter so it looks natural.
        const px = Math.round(Math.min(R - TW, Math.max(L, L + j * dx + (edge ? 0 : stagger + (rand() - 0.5) * 8))));
        this.placed.push({ prefab: trees[Math.floor(rand() * trees.length)], px, py, autoBlock: false });
      }
    }
    for (const { col, row } of this.cells(rect)) this.blocked.add(row * this.width + col);
    return this;
  }

  /**
   * A wood of any shape: the cells of `area` (one rect or many, e.g. a `blob`) are filled with trees that stand wholly
   * inside it (a dense, staggered stand), then bushes and rocks for the corners no tree fits; its cells block where
   * that art covers them (see `woods`).
   */
  grove(area: Rect | Rect[], opts: WoodsOptions = {}) {
    const cells = new Set<number>();
    for (const r of Array.isArray(area) ? area : [area])
      for (const { col, row } of this.cells(r)) cells.add(row * this.width + col);
    this.woods((c, r) => this.inMap(c, r) && cells.has(r * this.width + c), opts);
    return this;
  }

  /**
   * Fill the cells where `inside(col, row)` holds with trees (and fillers). Each tree stands wholly
   * inside: the cells under its trunk and lower canopy (its solid band) are all inside, its walk-behind top may lean
   * over the cell above. Trees go on a staggered lattice like `forest`'s, then any cell still bare gets the tree, bush
   * or rock that fits over it. `inside` may say yes beyond the map's edge (a wall at the world's edge runs on past it).
   * The cells are soft: `toMapData` blocks those the art covers (SOFT_COVER), and the `hard` ones whatever covers them,
   * so the edge of a wood is as walkable as it looks.
   */
  woods(inside: (col: number, row: number) => boolean, opts: WoodsOptions = {}) {
    const trees = opts.trees ?? TREES;
    const fillers = opts.fillers ?? ['bush', 'rockSmall'];
    const rand = rng(opts.seed ?? 4242);
    const covered = new Set<number>();
    const key = (c: number, r: number) => (r + 8) * (this.width + 16) + c + 8; // room for cells just off the map
    const foot = (name: PrefabName, px: number, py: number) => {
      const p = PREFABS[name];
      const band = p.solid?.band ?? p.h;
      const out: [number, number][] = [];
      for (let r = Math.floor((py + p.h - band) / CELL); r <= Math.floor((py + p.h - 1) / CELL); r++)
        for (let c = Math.floor(px / CELL); c <= Math.floor((px + p.w - 1) / CELL); c++) out.push([c, r]);
      return out;
    };
    const tryPlace = (name: PrefabName, px: number, py: number) => {
      const cells = foot(name, px, py);
      if (!cells.every(([c, r]) => inside(c, r))) return false;
      this.placed.push({ prefab: name, px, py, autoBlock: false });
      for (const [c, r] of cells) covered.add(key(c, r));
      return true;
    };
    // Where to look: every cell `inside`, on the map and a little round it.
    const spots: [number, number][] = [];
    for (let r = -6; r < this.height + 6; r++)
      for (let c = -6; c < this.width + 6; c++) if (inside(c, r)) spots.push([c, r]);
    if (!spots.length) return this;
    const { w: TW, h: TH } = PREFABS.treeA;
    const [minC, maxC] = [Math.min(...spots.map((s) => s[0])), Math.max(...spots.map((s) => s[0]))];
    const [minR, maxR] = [Math.min(...spots.map((s) => s[1])), Math.max(...spots.map((s) => s[1]))];
    // The lattice is anchored to the world, so neighbouring woods line up.
    for (let i = Math.floor((minR * CELL - TH) / WOOD_ROW); i * WOOD_ROW <= (maxR + 1) * CELL; i++) {
      const stagger = i % 2 ? WOOD_COL / 2 : 0;
      for (let j = Math.floor((minC * CELL - TW) / WOOD_COL) - 1; j * WOOD_COL <= (maxC + 1) * CELL; j++) {
        const px = j * WOOD_COL + stagger + Math.round((rand() - 0.5) * 8);
        const pick = trees[Math.floor(rand() * trees.length)];
        const py = i * WOOD_ROW + Math.round((rand() - 0.5) * 6);
        // A grove is a scatter of trees, not a thicket: most lattice spots stay empty. A wall (`hard`) keeps them all.
        if (opts.hard || rand() < (opts.density ?? GROVE_DENSITY)) tryPlace(pick, px, py);
      }
    }
    // Bare cells: the first tree, then bush, then rock that fits over each.
    for (const [c, r] of spots) {
      if (covered.has(key(c, r))) continue;
      // Only the wall's border row must be filled (it blocks whatever covers it); elsewhere gaps between trees stay open.
      if (opts.hard && !opts.hard(c, r)) continue;
      if (!opts.hard && !opts.fill) continue;
      [...trees, ...fillers].some((name) => {
        const p = PREFABS[name];
        const wCells = Math.ceil(p.w / CELL);
        for (let dc = 0; dc < wCells; dc++)
          for (let dr = 0; dr < 2; dr++) {
            const px = (c - dc) * CELL + Math.floor((wCells * CELL - p.w) / 2);
            if (tryPlace(name, px, (r + dr + 1) * CELL - p.h)) return true;
          }
        return false;
      });
      if (opts.hard?.(c, r) && this.inMap(c, r)) this.reasons.set(r * this.width + c, 'the wall along a border');
    }
    for (const [c, r] of spots) if (this.inMap(c, r)) this.soft.set(r * this.width + c, opts.hard?.(c, r) ?? false);
    return this;
  }

  /**
   * A raised plateau. `rect` is the walkable top in cells (at least 4x4); the rim rocks fill the 1-cell
   * ring around it (north/west/east) and the rock face the 2 rows south of it; all of that is blocked,
   * as are the four corner cells of `rect` where the rounded rim cuts in. Lay it on the ground that
   * should form the top (grass; snow for `kind: 'frost'`; sand for `'dry'`).
   * Stairs are the only way up: `stairs` lists the centre columns of 3-wide staircases cut into the south
   * face (each needs rect.col+2 <= column <= rect.col+w-3, so w >= 5, and >= 3 columns between stairs).
   * The top becomes level (existing level + 1); the stair cells are ramps connecting it to the level below.
   */
  plateau(rect: Rect, opts: { kind?: CliffKind; stairs?: number[] } = {}) {
    const { col, row, w, h } = rect;
    if (w < 4 || h < 4) throw new Error(`plateau needs at least 4x4 cells of walkable top, got ${w}x${h}`);
    const stairCols = [...(opts.stairs ?? [])].sort((a, b) => a - b);
    stairCols.forEach((c, i) => {
      if (c < col + 2 || c > col + w - 3)
        throw new Error(`stairs column ${c} must be within ${col + 2}..${col + w - 3} of this plateau`);
      if (i && c - stairCols[i - 1] < 3)
        throw new Error(`stairs at columns ${stairCols[i - 1]} and ${c} overlap (need 3+ apart)`);
    });
    const sheet = CLIFF.sheets[opts.kind ?? 'grass'];
    const { xs, ys } = CLIFF;
    const level = Math.max(...this.cells(rect).map(({ col: c, row: r }) => this.levelAt[r * this.width + c])) + 1;
    const nx = w - 2,
      ny = h - 2;
    const hx = (col + 1) * CELL,
      hy = (row + 1) * CELL; // world position of the art's 64x64 hole corner
    const underStairs = (i: number) => stairCols.some((c) => i >= c - 1 - (col + 1) && i <= c + 1 - (col + 1));

    // Source slices per axis: [source start, size, world start]. Middle slices repeat A/B chunks.
    const cols = [
      { sx: xs[0], sw: xs[1] - xs[0], wx: hx - (xs[1] - xs[0]), chunk: -1 },
      ...Array.from({ length: nx }, (_, i) => ({ sx: xs[1] + (i % 2) * CELL, sw: CELL, wx: hx + i * CELL, chunk: i })),
      { sx: xs[3], sw: xs[4] - xs[3], wx: hx + nx * CELL, chunk: -1 },
    ];
    const rows = [
      { sy: ys[0], sh: ys[1] - ys[0], wy: hy - (ys[1] - ys[0]), mid: false, last: false },
      ...Array.from({ length: ny }, (_, j) => ({
        sy: ys[1] + (j % 2) * CELL,
        sh: CELL,
        wy: hy + j * CELL,
        mid: true,
        last: false,
      })),
      { sy: ys[3], sh: ys[4] - ys[3], wy: hy + ny * CELL, mid: false, last: true },
    ];
    rows.forEach((r) => {
      cols.forEach((c) => {
        if (r.mid && c.chunk >= 0) return; // the hole: shows the ground (the walkable top)
        if (r.last && c.chunk >= 0 && underStairs(c.chunk)) return; // replaced by a staircase
        this.extras.push({
          sheet,
          x: c.sx,
          y: r.sy,
          w: c.sw,
          h: r.sh,
          px: c.wx,
          py: r.wy,
          tag: 'cliff',
          z: FLAT_Z + level,
        });
      });
    });
    const st = CLIFF.stairs;
    for (const c of stairCols) {
      this.extras.push({
        sheet,
        x: st.x,
        y: st.y,
        w: st.w,
        h: st.h,
        px: (c - 1) * CELL,
        py: hy + ny * CELL,
        tag: 'cliff',
        z: FLAT_Z + level,
      });
    }

    // Collision: rim ring, two face rows, rounded corners of the top; stairs open the face.
    const why = 'plateau rim';
    this.block({ col: col - 1, row: row - 1, w: w + 2, h: 1 }, why);
    this.block({ col: col - 1, row: row + h, w: w + 2, h: 2 }, why);
    this.block({ col: col - 1, row, w: 1, h }, why);
    this.block({ col: col + w, row, w: 1, h }, why);
    for (const [c, r] of [
      [col, row],
      [col + w - 1, row],
      [col, row + h - 1],
      [col + w - 1, row + h - 1],
    ])
      this.block({ col: c, row: r, w: 1, h: 1 }, why);
    for (const { col: c, row: r } of this.cells(rect)) this.levelAt[r * this.width + c] = level;
    for (const c of stairCols) {
      this.unblock({ col: c, row: row + h, w: 1, h: 2 });
      for (const r of [row + h, row + h + 1]) {
        this.levelAt[r * this.width + c] = level;
        this.ramps.add(r * this.width + c);
      }
    }
    return this;
  }

  /** Force cells blocked (water, cliffs, invisible edges...). Give a reason so `map check` doesn't flag them. */
  block(rect: Rect, reason: string) {
    for (const { col, row } of this.cells(rect)) {
      this.forced.set(row * this.width + col, true);
      this.reasons.set(row * this.width + col, reason);
    }
    return this;
  }

  /** Force cells walkable, overriding forests and props. */
  unblock(rect: Rect) {
    for (const { col, row } of this.cells(rect)) this.forced.set(row * this.width + col, false);
    return this;
  }

  spawn(col: number, row: number) {
    this.spawnAt = { col, row };
    return this;
  }

  npc(col: number, row: number) {
    this.npcAt = { col, row };
    return this;
  }

  /** An enemy spawn; `kind` is a key of MOB_KINDS in src/systems/combat.ts. */
  mob(kind: string, col: number, row: number) {
    this.mobList.push({ kind, col, row });
    return this;
  }

  /** A treasure chest (solid, so its cell is blocked). `kind` is a CHEST_KINDS name, `loot` a key of CHEST_LOOTS (src/systems/chests.ts). */
  chest(kind: string, loot: string, col: number, row: number) {
    this.chestList.push({ kind, loot, col, row });
    this.forced.set(row * this.width + col, true);
    this.reasons.set(row * this.width + col, 'chest');
    return this;
  }

  /**
   * A shopkeeper (`shop` is a key of SHOPS, src/systems/shops.ts) standing at (col, row), the cell below the door of its
   * building (`z.prop('smithy', ...)`). Characters block each other, so leave the cell open.
   */
  shop(shop: string, col: number, row: number) {
    this.shopList.push({ shop, col, row });
    return this;
  }

  /** A pet (`kind` is a key of PET_KINDS, src/systems/pets.ts): talk to it with the action key. It does not block, so any open cell will do. */
  pet(kind: string, col: number, row: number) {
    this.petList.push({ kind, col, row });
    return this;
  }

  /**
   * A doorway: walking onto the `w` cells starting at (col, row) takes the player to cell (toCol, toRow) of another zone.
   * The cells are opened up (a building's art would otherwise block them), so put the door where the art has one.
   * The arrival cell should be next to the other zone's own door, not on it.
   */
  door(col: number, row: number, w: number, toZone: string, toCol: number, toRow: number, dir?: DoorSpawn['dir']) {
    this.doorList.push({ col, row, w, to: { zone: toZone, col: toCol, row: toRow }, ...(dir ? { dir } : {}) });
    for (let i = 0; i < w; i++) this.forced.set(row * this.width + col + i, false);
    return this;
  }

  /** Mark the zone as a room: no weather, and no co-op overview map. */
  indoor() {
    this.isIndoor = true;
    return this;
  }

  /** What the spec placed besides terrain and props: the start, NPC, mobs, chests, shopkeepers and doors. */
  entities() {
    return {
      spawn: this.spawnAt,
      npc: this.npcAt,
      mobs: this.mobList,
      chests: this.chestList,
      shops: this.shopList,
      pets: this.petList,
      doors: this.doorList,
      indoor: this.isIndoor,
      climate: this.weather,
    };
  }

  /**
   * One world from several zones of the same size, each owning some cells (`owner[i]` = index into `zones`, -1 for
   * none): a cell takes its ground, collision, height and stairs from its owner; a terrain corner is painted when the
   * owner of any cell touching it painted it (so a neighbour's sand fades softly across the seam; an opaque terrain,
   * which brings its own sea, is taken from the cell's owner alone); a prop or tree is
   * kept when the cell its foot stands on is its own zone's (or off the map, like a border forest's overhang). Points
   * (spawn, mobs, doors...) are not carried over: read them from each zone's `entities()`.
   */
  static compose(width: number, height: number, owner: Int16Array, zones: Zone[]): Zone {
    const out = new Zone(width, height);
    for (let i = 0; i < width * height; i++) {
      const z = zones[owner[i]];
      if (!z) continue;
      out.ground[i] = z.ground[i];
      out.surfaceAt[i] = z.surfaceAt[i];
      out.levelAt[i] = z.levelAt[i];
      if (z.ramps.has(i)) out.ramps.add(i);
      if (z.blocked.has(i)) out.blocked.add(i);
      const soft = z.soft.get(i);
      if (soft !== undefined) out.soft.set(i, soft);
      const forced = z.forced.get(i);
      if (forced !== undefined) out.forced.set(i, forced);
      const why = z.reasons.get(i);
      if (why) out.reasons.set(i, why);
    }
    const W = width + 1;
    const names = new Set(zones.flatMap((z) => [...z.terrain.keys()]));
    for (const name of names) {
      if ('opaque' in TERRAINS[name]) {
        // Opaque terrain carries its own sea: each cell shows only what its owner painted, so it stops at the border.
        const masks = new Uint8Array(width * height);
        for (let i = 0; i < masks.length; i++)
          masks[i] = zones[owner[i]]?.cornerMask(name, i % width, Math.floor(i / width)) ?? 0;
        out.cellMasks.set(name, masks);
        continue;
      }
      const v = new Uint8Array(W * (height + 1));
      for (let row = 0; row <= height; row++) {
        for (let col = 0; col <= width; col++) {
          for (const [c, r] of [
            [col - 1, row - 1],
            [col, row - 1],
            [col - 1, row],
            [col, row],
          ]) {
            if (c < 0 || r < 0 || c >= width || r >= height) continue;
            if (zones[owner[r * width + c]]?.terrain.get(name)?.[row * W + col]) {
              v[row * W + col] = 1;
              break;
            }
          }
        }
      }
      out.terrain.set(name, v);
    }
    const ownsFoot = (k: number, px: number, py: number) => {
      const col = Math.floor(px / CELL),
        row = Math.floor(py / CELL);
      return col < 0 || row < 0 || col >= width || row >= height || owner[row * width + col] === k;
    };
    zones.forEach((z, k) => {
      for (const p of z.placed) {
        const prefab = PREFABS[p.prefab];
        if (ownsFoot(k, p.px + prefab.w / 2, p.py + prefab.h - 1)) out.placed.push(p);
      }
      for (const e of z.extras) if (ownsFoot(k, e.px + e.w / 2, e.py + e.h / 2)) out.extras.push(e);
    });
    out.spawnAt = zones[0]?.spawnAt ?? { col: 0, row: 0 };
    return out;
  }

  /** The zone's weather: which precipitation can fall and how the wind blows there (see CLIMATES, systems/weather.ts). */
  climate(name: ClimateName) {
    this.weather = name;
    return this;
  }

  /** Resolve everything into the game's map format. */
  toMapData(): MapData {
    if (!this.spawnAt) throw new Error('zone has no spawn(); the player needs a start cell');
    const sheets: string[] = [];
    const sheetIndex = (name: string) => {
      const i = sheets.indexOf(name);
      return i >= 0 ? i : sheets.push(name) - 1;
    };
    const surface = [...this.surfaceAt];
    const ground: (GroundCell | null)[] = this.ground.map((g, i) => {
      const col = i % this.width,
        row = Math.floor(i / this.width);
      let layers: number[] = g ? [sheetIndex(g.sheet), g.x, g.y] : [];
      for (const name of TERRAIN_NAMES) {
        const m = this.cornerMask(name, col, row);
        if (!m) continue;
        const table = tileTable(name);
        // A full tile hides everything under it, so the stack starts again there.
        if (m === FULL) layers = [];
        for (const part of decompose(table, m)) {
          const [x, y] = part === FULL ? variant(table.get(FULL)!, col, row) : table.get(part)![0];
          layers.push(sheetIndex((TERRAINS[name] as TerrainDef).sheet ?? TERRAIN_SHEET), x, y);
        }
        // Mostly covered: the cell is made of it now (footprints, ice, the co-op map).
        if ([8, 4, 2, 1].filter((b) => m & b).length >= 3) surface[i] = SURFACES.indexOf(TERRAINS[name].surface);
      }
      return layers.length ? (layers as GroundCell) : null;
    });

    const objects: MapObject[] = [];
    for (const e of this.extras) {
      objects.push({ s: sheetIndex(e.sheet), x: e.x, y: e.y, w: e.w, h: e.h, px: e.px, py: e.py, tag: e.tag, z: e.z });
    }
    const autoParts: { o: MapObject; band: number; min: number }[] = [];
    for (const p of this.placed) {
      const prefab = PREFABS[p.prefab];
      for (const part of prefab.parts) {
        const o: MapObject = {
          s: sheetIndex(prefab.sheet),
          x: part.x,
          y: part.y,
          w: part.w,
          h: part.h,
          px: p.px + part.dx,
          py: p.py + part.dy,
        };
        if (prefab.tag) o.tag = prefab.tag;
        objects.push(o);
        // All parts end on the prefab's bottom, so the band is measured from each part's own bottom.
        if (p.autoBlock && prefab.solid) autoParts.push({ o, ...prefab.solid });
      }
    }

    const blocked = new Set(this.blocked);
    // Props: block cells covered enough by the bottom band of their art. Prefabs differ in band/min,
    // so measure each (band, min) group separately.
    const groups = new Map<string, typeof autoParts>();
    for (const a of autoParts) {
      const key = `${a.band}:${a.min}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    for (const group of groups.values()) {
      const { band, min } = group[0];
      const cov = coverage(
        { width: this.width, height: this.height, sheets, objects: group.map((a) => a.o) },
        () => band,
      );
      cov.forEach((c, i) => c >= min && blocked.add(i));
    }
    // Woods: their cells block where the art (all of it, so a neighbouring prop counts too) covers them.
    if (this.soft.size) {
      const cov = coverage({ width: this.width, height: this.height, sheets, objects });
      for (const [i, hard] of this.soft) if (hard || cov[i] >= SOFT_COVER) blocked.add(i);
    }
    for (const [i, on] of this.forced) {
      if (on) blocked.add(i);
      else blocked.delete(i);
    }

    return {
      version: 2,
      width: this.width,
      height: this.height,
      sheets,
      ground,
      objects,
      collision: [...blocked].sort((a, b) => a - b),
      surfaces: SURFACES,
      surface,
      level: this.levelAt,
      ramps: [...this.ramps].sort((a, b) => a - b),
      spawn: this.spawnAt,
      npc: this.npcAt,
      mobs: this.mobList,
      chests: this.chestList,
      shops: this.shopList,
      pets: this.petList,
      doors: this.doorList,
      indoor: this.isIndoor,
      climate: this.weather,
    };
  }
}
