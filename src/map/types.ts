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
  tag?: string; // what it is (tree, bush, rock, flower, cliff...), for game systems; see Prefab.tag
  z?: number; // sort key override; default is the bottom edge (py + h). Flat ground art (cliffs) uses a very low z
}

/** The sort key MapView and the previews use to order objects (and, via zIndex, entities) back to front. */
export const sortKey = (o: MapObject) => o.z ?? o.py + o.h;

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
  version: 2;
  width: number; // in cells
  height: number;
  sheets: string[]; // file names under public/tilesets/
  ground: (GroundCell | null)[]; // row-major, width*height
  objects: MapObject[]; // y-sorted by (py + h) at render time
  collision: number[]; // blocked cell indices (row * width + col)
  // Per-cell terrain metadata for game systems (footprints, elevation...). All row-major, width*height.
  surfaces: string[]; // surface names, indexed by `surface`: grass, sand, snow, stone, water, ice
  surface: number[]; // what the ground is made of
  level: number[]; // height: 0 = ground; plateaus are 1+. Open neighbours may differ in level only across a ramp
  ramps: number[]; // cell indices of stairs/slopes, which connect levels
  spawn: CellPoint;
  npc: CellPoint | null;
  mobs: MobSpawn[];
}

export function parseMap(json: unknown): MapData {
  const d = json as Partial<MapData>;
  if (!d || d.version !== 2 || !d.width || !d.height || !Array.isArray(d.ground)) {
    throw new Error('Not a valid map file (expected version 2; rebuild with `npm run map -- build`)');
  }
  const cells = d.width * d.height;
  return {
    version: 2,
    width: d.width,
    height: d.height,
    sheets: d.sheets ?? [],
    ground: d.ground,
    objects: d.objects ?? [],
    collision: d.collision ?? [],
    surfaces: d.surfaces ?? ['grass'],
    surface: d.surface ?? new Array(cells).fill(0),
    level: d.level ?? new Array(cells).fill(0),
    ramps: d.ramps ?? [],
    spawn: d.spawn ?? { col: 1, row: 1 },
    npc: d.npc ?? null,
    mobs: d.mobs ?? [],
  };
}
