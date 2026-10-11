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
import { coverage, sheet as loadSheet } from './image';

/** A rectangle of cells. May extend past the map edge (e.g. for border forests); it's clipped where needed. */
export interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface ZoneSpec {
  name: string; // output: public/maps/<name>.json
  width: number;
  height: number;
  build(z: Zone): void;
}

/** Declare a zone. Files in maps/ default-export one of these; `npm run map -- build` turns it into JSON. */
export const defineZone = (spec: ZoneSpec) => spec;

/** Small deterministic PRNG so builds are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Surface names in the order stored in MapData.surfaces (a cell's `surface` indexes this). */
const SURFACES: string[] = Object.keys(GROUND);

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
export class Zone {
  private ground: ({ sheet: string; x: number; y: number } | null)[];
  private placed: Placed[] = [];
  private extras: Extra[] = [];
  private surfaceAt: number[]; // per cell: index into SURFACES
  private levelAt: number[]; // per cell: height (0 = ground)
  private ramps = new Set<number>();
  private blocked = new Set<number>();
  private forced = new Map<number, boolean>(); // block()/unblock() overrides, applied last
  readonly reasons = new Map<number, string>(); // why a cell was blocked by hand (silences check warnings)
  private spawnAt: CellPoint | null = null;
  private npcAt: CellPoint | null = null;
  private mobList: MobSpawn[] = [];
  private chestList: ChestSpawn[] = [];
  private shopList: ShopSpawn[] = [];
  private doorList: DoorSpawn[] = [];
  private isIndoor = false;

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

  /**
   * A doorway: walking onto the `w` cells starting at (col, row) takes the player to cell (toCol, toRow) of another zone.
   * The cells are opened up (a building's art would otherwise block them), so put the door where the art has one.
   * The arrival cell should be next to the other zone's own door, not on it.
   */
  door(col: number, row: number, w: number, toZone: string, toCol: number, toRow: number) {
    this.doorList.push({ col, row, w, to: { zone: toZone, col: toCol, row: toRow } });
    for (let i = 0; i < w; i++) this.forced.set(row * this.width + col + i, false);
    return this;
  }

  /** Mark the zone as a room: no weather, and no co-op overview map. */
  indoor() {
    this.isIndoor = true;
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
    const ground: (GroundCell | null)[] = this.ground.map((g) => (g ? [sheetIndex(g.sheet), g.x, g.y] : null));

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
      surface: this.surfaceAt,
      level: this.levelAt,
      ramps: [...this.ramps].sort((a, b) => a - b),
      spawn: this.spawnAt,
      npc: this.npcAt,
      mobs: this.mobList,
      chests: this.chestList,
      shops: this.shopList,
      doors: this.doorList,
      indoor: this.isIndoor,
    };
  }
}
