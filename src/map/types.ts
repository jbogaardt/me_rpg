/** Size of one map cell in world pixels. All tileset art is cut on this grid. */
export const CELL = 32;

/** A ground cell: which tileset sheet (index into MapData.sheets) and the top-left of its 32x32 source region. */
export type GroundCell = [sheet: number, x: number, y: number];

/** A free-standing sprite (tree, rock...) cut from a sheet and placed at a world position. */
export interface MapObject {
  s: number; // sheet index
  x: number; // source rect within the sheet
  y: number;
  w: number;
  h: number;
  px: number; // world position of the top-left corner
  py: number;
}

export interface CellPoint {
  col: number;
  row: number;
}

/** An enemy spawn point; `kind` is a key of MOB_KINDS (src/game/combat.ts). */
export interface MobSpawn extends CellPoint {
  kind: string;
}

/**
 * The on-disk map format (public/maps/<zone>.json). Generated from a zone spec in maps/ by
 * `npm run map -- build`; don't edit the JSON by hand.
 */
export interface MapData {
  version: 1;
  width: number; // in cells
  height: number;
  sheets: string[]; // file names under public/tilesets/
  ground: (GroundCell | null)[]; // row-major, width*height
  objects: MapObject[]; // y-sorted by (py + h) at render time
  collision: number[]; // blocked cell indices (row * width + col)
  spawn: CellPoint;
  npc: CellPoint | null;
  mobs: MobSpawn[];
}

export function createEmptyMap(width: number, height: number): MapData {
  return {
    version: 1,
    width,
    height,
    sheets: [],
    ground: new Array(width * height).fill(null),
    objects: [],
    collision: [],
    spawn: { col: Math.min(2, width - 1), row: Math.min(2, height - 1) },
    npc: null,
    mobs: [],
  };
}

export function parseMap(json: unknown): MapData {
  const d = json as Partial<MapData>;
  if (!d || d.version !== 1 || !d.width || !d.height || !Array.isArray(d.ground)) {
    throw new Error('Not a valid map file (expected version 1)');
  }
  return {
    version: 1,
    width: d.width,
    height: d.height,
    sheets: d.sheets ?? [],
    ground: d.ground,
    objects: d.objects ?? [],
    collision: d.collision ?? [],
    spawn: d.spawn ?? { col: 1, row: 1 },
    npc: d.npc ?? null,
    mobs: d.mobs ?? [],
  };
}

/** Returns a copy of `map` resized to the new dimensions, keeping what still fits. */
export function resizeMap(map: MapData, width: number, height: number): MapData {
  const next = createEmptyMap(width, height);
  next.sheets = map.sheets;
  next.objects = map.objects;
  for (let r = 0; r < Math.min(height, map.height); r++) {
    for (let c = 0; c < Math.min(width, map.width); c++) {
      next.ground[r * width + c] = map.ground[r * map.width + c] ?? null;
    }
  }
  next.collision = map.collision
    .map((i) => ({ col: i % map.width, row: Math.floor(i / map.width) }))
    .filter((p) => p.col < width && p.row < height)
    .map((p) => p.row * width + p.col);
  next.spawn = { col: Math.min(map.spawn.col, width - 1), row: Math.min(map.spawn.row, height - 1) };
  next.npc = map.npc && map.npc.col < width && map.npc.row < height ? map.npc : null;
  next.mobs = map.mobs.filter((m) => m.col < width && m.row < height);
  return next;
}
