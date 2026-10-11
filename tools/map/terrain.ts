// Corner-based terrain (autotiling) on the LPC terrain atlas (public/tilesets/lpc_terrain.png, source and credits in
// art/lpc_terrain/). A terrain is painted on the *corners* of cells: `zone.paint('bog', rect)` marks the four corners
// of every cell in the rect, and each cell then shows the tile whose corners match (a full tile inside, soft edges and
// corners around it, reaching half a cell past the rect). So any shape works, stepped borders and inner corners
// included, which the ring-based `zone.patch` cannot do.
//
// Every terrain is a see-through layer drawn over the cell's ground (`zone.fill`), lowest TERRAINS entry first, so
// several can overlap (sand on grass, bog on mud...). The "opaque" ones (`coast`, `snowCoast`) are islands painted
// over their own sea: lay them where the ground is that sea.
//
// Which tile has which corners comes from the atlas's own Tiled tileset (art/lpc_terrain/Terrain.tsx).

import fs from 'node:fs';
import path from 'node:path';
import { CELL } from '../../src/map/types';
import { ROOT } from './image';

export const TERRAIN_SHEET = 'lpc_terrain.png';

/** A corner mask: bit 3 = top-left, 2 = top-right, 1 = bottom-left, 0 = bottom-right (Tiled's corner order). */
export type Mask = number;
export const FULL: Mask = 0b1111;

interface TerrainDef {
  lpc: string; // the terrain's name in Terrain.tsx
  surface: string; // what a cell (mostly) covered by it is made of: footprints, ice, the co-op map's colours
  opaque?: true; // painted over its own sea, so it hides everything below and never fades across a biome's border
  about: string;
}

/**
 * The terrains, in drawing order (the first is lowest). Names are what zone specs paint with. The opaque island kinds
 * come first (they hide whatever is under them), then grounds that cover a whole biome, then paths, then water and
 * holes, so a road or a pond shows on any of them.
 */
export const TERRAINS = {
  coast: {
    lpc: 'Sand Water',
    opaque: true,
    surface: 'sand',
    about: 'Sand meeting the sea, opaque: paint the land over a sea `fill`.',
  },
  snowCoast: {
    lpc: 'Snow Water',
    opaque: true,
    surface: 'snow',
    about: 'Snow meeting the sea, opaque: paint the land over a sea `fill`.',
  },
  meadow: { lpc: 'Grass', surface: 'grass', about: 'Leafy grass with a ragged edge (grass over dirt or sand).' },
  darkGrass: { lpc: 'Dark Grass', surface: 'grass', about: 'Deep green grass (jungle, marsh).' },
  snow: { lpc: 'Snow', surface: 'snow', about: 'Snow with a soft edge.' },
  sand: { lpc: 'Sand', surface: 'sand', about: 'Pale sand with a soft edge.' },
  redDirt: { lpc: 'Red Dirt', surface: 'dirt', about: 'Rust-red earth (badlands, mesas).' },
  ash: { lpc: 'Grey Dirt', surface: 'ash', about: 'Grey ash and gravel (the undead lands).' },
  soot: {
    lpc: 'Black Dirt',
    surface: 'ash',
    about: 'Black scorched earth (no inner corners; they are built from edges).',
  },
  mud: { lpc: 'Dark Dirt', surface: 'mud', about: 'Brown mud with a pebbly edge.' },
  dirt: { lpc: 'Trans Dirt', surface: 'dirt', about: 'Pale sandy dirt with pebbles: paths and trails.' },
  road: { lpc: 'Brick Road', surface: 'stone', about: 'Brown brick paving.' },
  pond: { lpc: 'Water', surface: 'water', about: 'Clear water with an earthy bank. Block the painted rect.' },
  bog: { lpc: 'Sewer Water', surface: 'bog', about: 'Murky swamp water. Block the painted rect.' },
  ice: { lpc: 'Ice', surface: 'ice', about: 'A frozen pond with an earthy rim (slippery).' },
  lava: { lpc: 'Lava', surface: 'lava', about: 'Molten rock. Block the painted rect.' },
  pit: { lpc: 'Hole', surface: 'pit', about: 'A dark earthen pit. Block the painted rect.' },
  abyss: { lpc: 'Black Hole', surface: 'pit', about: 'A black chasm. Block the painted rect.' },
} satisfies Record<string, TerrainDef>;
export type TerrainName = keyof typeof TERRAINS;
export const TERRAIN_NAMES = Object.keys(TERRAINS) as TerrainName[];

/** One terrain's tiles: corner mask -> source [x, y] in px (several when the atlas has variants of a full tile). */
export type TileTable = Map<Mask, [number, number][]>;

let tables: Map<string, TileTable> | null = null;

/** Parse Terrain.tsx: every tile whose corners are one terrain or empty gives that terrain's tile for that mask. */
export function lpcTables(): Map<string, TileTable> {
  if (tables) return tables;
  const xml = fs.readFileSync(path.join(ROOT, 'art/lpc_terrain/Terrain.tsx'), 'utf8');
  const names = [...xml.matchAll(/<terrain name="([^"]+)"/g)].map((m) => m[1]);
  const columns = 1024 / CELL;
  tables = new Map(names.map((n) => [n, new Map()]));
  for (const [, id, corners] of xml.matchAll(/<tile id="(\d+)" terrain="([^"]*)"/g)) {
    const parts = corners.split(',');
    const kinds = new Set(parts.filter((p) => p !== ''));
    if (kinds.size !== 1) continue; // a tile between two terrains (only the dirt pair has these)
    const kind = [...kinds][0];
    const mask = parts.reduce((m, p, i) => (p === kind ? m | (1 << (3 - i)) : m), 0);
    const table = tables.get(names[Number(kind)])!;
    const n = Number(id);
    table.set(mask, [...(table.get(mask) ?? []), [(n % columns) * CELL, Math.floor(n / columns) * CELL]]);
  }
  return tables;
}

export function tileTable(name: TerrainName): TileTable {
  const t = lpcTables().get(TERRAINS[name].lpc);
  if (!t) throw new Error(`terrain ${name}: "${TERRAINS[name].lpc}" is not in Terrain.tsx`);
  return t;
}

const bits = (m: Mask) => [8, 4, 2, 1].filter((b) => m & b);

/**
 * The masks to draw, stacked, for corner mask `m`: the tile itself when the atlas has it, otherwise the fewest tiles
 * whose corners add up to it (two opposite corners, or an inner corner a terrain lacks, from edges and corners).
 */
export function decompose(table: TileTable, m: Mask): Mask[] {
  if (!m) return [];
  if (table.has(m)) return [m];
  const subs = [...table.keys()].filter((k) => k && (k & m) === k);
  for (const a of subs) for (const b of subs) if ((a | b) === m) return [a, b];
  for (const a of subs) for (const b of subs) for (const c of subs) if ((a | b | c) === m) return [a, b, c];
  const singles = bits(m).filter((b) => table.has(b));
  if (singles.length !== bits(m).length) throw new Error(`no tiles for corner mask ${m.toString(2)}`);
  return singles;
}

/** A deterministic pick among a full tile's variants: mostly the plain first one, now and then a detailed one. */
export function variant<T>(options: T[], col: number, row: number): T {
  if (options.length === 1) return options[0];
  const h = (((col * 73856093) ^ (row * 19349663)) >>> 0) % 100;
  return h < 70 ? options[0] : options[1 + (h % (options.length - 1))];
}
