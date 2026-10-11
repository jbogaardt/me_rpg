import {
  CELL,
  type CellPoint,
  type GroundCell,
  type MapData,
  type MapObject,
  type MobSpawn,
} from '../../src/map/types';
import { GROUND, PREFABS, RINGS, TREES, type GroundName, type PrefabName } from './catalog';
import { coverage } from './image';

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
  private blocked = new Set<number>();
  private forced = new Map<number, boolean>(); // block()/unblock() overrides, applied last
  readonly reasons = new Map<number, string>(); // why a cell was blocked by hand (silences check warnings)
  private spawnAt: CellPoint | null = null;
  private npcAt: CellPoint | null = null;
  private mobList: MobSpawn[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.ground = new Array<(typeof this.ground)[number]>(width * height).fill(null);
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

  private setGround(col: number, row: number, sheet: string, [x, y]: [number, number]) {
    if (this.inMap(col, row)) this.ground[row * this.width + col] = { sheet, x, y };
  }

  private fillTile(name: GroundName, col: number, row: number) {
    const g = GROUND[name];
    const line = g.tiles[row % g.tiles.length];
    this.setGround(col, row, g.sheet, line[col % line.length]);
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
      if (edge) this.setGround(col, row, ring.sheet, edge);
      else this.fillTile(name, col, row);
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
  forest(rect: Rect, opts: { seed?: number } = {}) {
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
        this.placed.push({ prefab: TREES[Math.floor(rand() * TREES.length)], px, py, autoBlock: false });
      }
    }
    for (const { col, row } of this.cells(rect)) this.blocked.add(row * this.width + col);
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
      version: 1,
      width: this.width,
      height: this.height,
      sheets,
      ground,
      objects,
      collision: [...blocked].sort((a, b) => a - b),
      spawn: this.spawnAt,
      npc: this.npcAt,
      mobs: this.mobList,
    };
  }
}
