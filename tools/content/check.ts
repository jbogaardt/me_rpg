// Checks the content (public/content/*.json) against the built maps: every biome draws from a map that exists, with
// the map's tilesets and weather; every scenario puts its people and its arrival on open ground of its own biome; every
// roam rule finds room. Run by `npm run map -- check` (and so by `verify` and `build`); `npm run map -- build` also
// writes each biome's tilesets from its map (`syncTilesets`).
import fs from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { roam } from '../../src/content/populate';
import type { ContentManager } from '../../src/content/ContentManager';
import type { MapData } from '../../src/map/types';
import { CONTENT_DIR, readContentFile } from './disk';

export interface ContentReport {
  errors: string[];
  warnings: string[];
}

/** Is (x, y) a cell a person can stand on in this map: inside it, open, and the biome's own (not the neighbour's margin)? */
function standable(map: MapData, x: number, y: number): string | null {
  const col = Math.round(x);
  const row = Math.round(y);
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return 'is outside the map';
  const i = row * map.width + col;
  if (map.surfaces[map.surface[i]] === 'beyond') return 'is in the neighbouring biome';
  if (map.collision.includes(i)) return 'is on a blocked cell';
  if (map.doors.some((d) => d.row === row && col >= d.col && col < d.col + d.w)) return 'is on a door';
  return null;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);

export function checkContent(content: ContentManager, maps: Map<string, MapData>): ContentReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { biomes, scenarios } = content.content;
  const named = new Set<string>();
  for (const [type, biome] of Object.entries(biomes)) {
    named.add(biome.map);
    const map = maps.get(biome.map);
    if (!map) {
      errors.push(`biomes.${type}.map: no map "${biome.map}" (public/maps/)`);
      continue;
    }
    if (!sameList(biome.tilesets, map.sheets))
      errors.push(`biomes.${type}.tilesets differ from the map's; run \`npm run map -- build\` to write them`);
    if (map.indoor && biome.climate !== null) errors.push(`biomes.${type}.climate: a room has none (null)`);
    if (!map.indoor && biome.climate !== map.climate)
      errors.push(`biomes.${type}.climate is "${biome.climate}", the map's spec says "${map.climate}"`);
    biome.generation.roam?.forEach((rule, i) => {
      const placed = roam(map, rule).length;
      if (placed < rule.count)
        warnings.push(`biomes.${type}.generation.roam[${i}] places ${placed} of ${rule.count}: not enough open ground`);
    });
  }
  for (const name of maps.keys()) if (!named.has(name)) errors.push(`map "${name}" has no biome in biomes.json`);

  for (const node of scenarios.nodes.values()) {
    const biome = biomes[node.biome_type];
    const map = biome && maps.get(biome.map);
    if (!map) continue; // reported above, or by the content's own checks
    const at = `nodes.${node.node_id}`;
    node.entities.forEach((p, i) => {
      const bad = standable(map, p.x, p.y);
      if (bad) errors.push(`${at}.entities[${i}] (${p.entity} at ${p.x},${p.y}) ${bad} of ${biome.map}`);
    });
    if (node.spawn) {
      const bad = standable(map, node.spawn.x, node.spawn.y);
      if (bad) errors.push(`${at}.spawn (${node.spawn.x},${node.spawn.y}) ${bad} of ${biome.map}`);
    }
  }
  return { errors, warnings };
}

/** Write each biome's `tilesets` from its map (what the map build decided), keeping the rest of biomes.json as it is. */
export async function syncTilesets(maps: Map<string, MapData>): Promise<string[]> {
  const file = readContentFile('biomes') as { biomes?: Record<string, { map?: string; tilesets?: string[] }> };
  const changed: string[] = [];
  for (const [type, biome] of Object.entries(file.biomes ?? {})) {
    const map = biome.map && maps.get(biome.map);
    if (!map || (biome.tilesets && sameList(biome.tilesets, map.sheets))) continue;
    biome.tilesets = [...map.sheets];
    changed.push(type);
  }
  if (changed.length) {
    const target = path.join(CONTENT_DIR, 'biomes.json');
    const options = (await prettier.resolveConfig(target)) ?? {};
    fs.writeFileSync(target, await prettier.format(JSON.stringify(file), { ...options, filepath: target }));
  }
  return changed;
}
