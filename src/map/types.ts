/** Size of one map cell in world pixels. All tileset art is cut on this grid. */
export const CELL = 32;

/**
 * A ground cell: which tileset sheet (index into MapData.sheets) and the top-left of its 32x32 source region. More
 * triples may follow: layers drawn over the first one, bottom to top (the soft, see-through edges of a terrain such
 * as sand or bog painted over grass; tools/map/terrain.ts).
 */
export type GroundCell = [sheet: number, x: number, y: number, ...layers: number[]];

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

/** Sort key of flat ground-level art (cliffs); a plateau of level n adds n. Above the ground layer, below every y-sorted thing. */
export const FLAT_Z = -1e8;
/** Sort key of ground decals (footprints): above all flat art, below entities and objects. */
export const DECAL_Z = FLAT_Z + 50;

/** The sort key MapView and the previews use to order objects (and, via zIndex, entities) back to front. */
export const sortKey = (o: MapObject) => o.z ?? o.py + o.h;

export interface CellPoint {
  col: number;
  row: number;
}

/** An enemy to spawn; `kind` is a key of MOB_KINDS (src/systems/combat.ts). Placed by the content (content/populate.ts), not the map. */
export interface MobSpawn extends CellPoint {
  kind: string;
}

/** A treasure chest; `kind` picks its art (CHEST_KINDS) and `loot` is a key of CHEST_LOOTS (src/systems/chests.ts). */
export interface ChestSpawn extends CellPoint {
  kind: string;
  loot: string;
}

/** A crop plot (solid; `kind` is a key of CROPS, src/systems/crops.ts): grows, ripens, and is picked with the action key. */
export interface CropSpawn extends CellPoint {
  kind: string;
}

/** A pet (a key of PET_KINDS, src/systems/pets.ts) lying about at `col,row`. */
export interface PetSpawn extends CellPoint {
  kind: string;
}

/** A shopkeeper standing at `col,row`; `shop` is a key of SHOPS (src/systems/shops.ts). The building is a map prop. */
export interface ShopSpawn extends CellPoint {
  shop: string;
}

/** A quest giver standing at `col,row`; `giver` is a key of GIVERS (src/systems/quests.ts). */
export interface GiverSpawn extends CellPoint {
  giver: string;
}

/** A place a gather quest sends the player to; `kind` is a key of SITE_KINDS (src/systems/quests.ts). Walkable: it is touched, not blocked. */
export interface SiteSpawn extends CellPoint {
  kind: string;
}

/** A named spot (the old ruins, an oasis): its name shows on the map once the player has explored round it. */
export interface PlaceSpawn extends CellPoint {
  name: string;
}

/**
 * A signpost at a fork in the road (its foot is `col,row`, a solid cell): `ways` names where each way leads, as a zone
 * key or a place on this map (systems/signs.ts). The art is a map object; this is what the action key reads.
 */
export interface SignSpawn extends CellPoint {
  ways: Partial<Record<'up' | 'down' | 'left' | 'right', string>>;
}

/** Walking onto a door cell takes the player to another zone (`to.col`/`to.row` is where they appear). */
export interface DoorSpawn extends CellPoint {
  w: number; // cells wide, starting at `col` (a hall's door is two cells wide, a tower's one)
  to: { zone: string; col: number; row: number; port?: string };
  /** The way a player walking through it is going across the world, on a gap between two biomes: the screen slides that way. */
  dir?: 'up' | 'down' | 'left' | 'right';
}

/**
 * A doorway whose far side is the content's to decide, not the map's (a random campaign joins regions by their ports):
 * the `w` cells from `col,row` are the doorway, `arrive` is where a player coming in through it appears. The content
 * (biomes.json `ports`) binds it to another map's port, which makes it a door (`wireDoors`, src/content/ports.ts); a
 * port nothing binds is walled up.
 */
export interface PortSpawn extends CellPoint {
  name: string;
  w: number;
  arrive: CellPoint;
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
  chests: ChestSpawn[]; // solid; opened with the action key
  crops: CropSpawn[]; // solid plots; picked with the action key when ripe
  shops: ShopSpawn[]; // shopkeepers: the action key opens their counter
  pets: PetSpawn[]; // dogs and cats to talk to: the action key makes them answer
  givers: GiverSpawn[]; // quest givers: the action key talks to them
  places: PlaceSpawn[]; // named spots, labelled on the map once explored
  signs: SignSpawn[]; // signposts at the forks of the roads: the action key reads where each way leads
  sites: SiteSpawn[]; // where gather quests send the player; touched with the action key while a quest wants them
  doors: DoorSpawn[]; // cells that lead to another zone (a shop's door, a gap into the next biome, and the ways back)
  ports: PortSpawn[]; // doorways the content binds to other maps' ports (left out of the file when there are none)
  indoor: boolean; // no weather, no overlay map: a room rather than the open world
  /** The zone's weather (a key of CLIMATES in systems/weather.ts): what falls and blows there. Rooms have none. */
  climate: string;
}

/**
 * The map as stored on disk (public/maps/<zone>.json, written by tools/map/encode.ts): `MapData` packed small. Ground
 * cells name an entry of `palette` (most cells share a few dozen stacks; -1 = no ground), and objects are flat
 * `[part, px, py]` triples naming an entry of `parts` (`[sheet, x, y, w, h, tag, z]`, tag -1 for none, z null for the
 * default; tags index `tags`). Everything else is as in `MapData`.
 */
export interface PackedMap extends Omit<MapData, 'version' | 'ground' | 'objects' | 'ports'> {
  version: 3;
  ports?: PortSpawn[];
  palette: GroundCell[];
  ground: number[];
  tags: string[];
  parts: [s: number, x: number, y: number, w: number, h: number, tag: number, z: number | null][];
  objects: number[];
}

/** Read a map file (current or the older unpacked version 2) into `MapData`, filling defaults for missing fields. */
export function parseMap(json: unknown): MapData {
  const p = json as Partial<PackedMap>;
  if (p && p.version === 3 && Array.isArray(p.palette) && Array.isArray(p.ground) && Array.isArray(p.parts)) {
    const palette = p.palette;
    const parts = p.parts;
    const tags = p.tags ?? [];
    const flat = p.objects ?? [];
    const objects: MapObject[] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) {
      const part = parts[flat[i]!];
      if (!part) throw new Error('Map file names an object part it does not have');
      const [s, x, y, w, h, tag, z] = part;
      const o: MapObject = { s, x, y, w, h, px: flat[i + 1]!, py: flat[i + 2]! };
      if (tag >= 0 && tags[tag]) o.tag = tags[tag];
      if (z !== null) o.z = z;
      objects.push(o);
    }
    return unpacked({ ...p, version: 2, ground: p.ground.map((k) => palette[k] ?? null), objects });
  }
  return unpacked(json);
}

function unpacked(json: unknown): MapData {
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
    surface: d.surface ?? new Array<number>(cells).fill(0),
    level: d.level ?? new Array<number>(cells).fill(0),
    ramps: d.ramps ?? [],
    spawn: d.spawn ?? { col: 1, row: 1 },
    npc: d.npc ?? null,
    chests: d.chests ?? [],
    crops: d.crops ?? [],
    shops: d.shops ?? [],
    pets: d.pets ?? [],
    givers: d.givers ?? [],
    sites: d.sites ?? [],
    places: d.places ?? [],
    signs: d.signs ?? [],
    doors: d.doors ?? [],
    ports: d.ports ?? [],
    indoor: d.indoor ?? false,
    climate: d.climate ?? 'temperate',
  };
}
