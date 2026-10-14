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
import { campaigns, CONTENT_DIR, loadContentFromDisk, readContentFile } from './disk';

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

/**
 * Check one campaign's content against the maps. Its biomes must draw from maps that exist; `maps` may hold other
 * campaigns' maps too (see `checkCampaigns` for a map no campaign uses).
 */
export function checkContent(content: ContentManager, maps: Map<string, MapData>): ContentReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { biomes, scenarios } = content.content;
  const mine = new Set(Object.values(biomes).map((b) => b.map));
  for (const [type, biome] of Object.entries(biomes)) {
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
  // The links are the doors: every zone a map has a door to (in this campaign) is linked, and nothing else, except that
  // the training halls are reached by the trainer's magic, so only their way out is a door and nothing links to them.
  const walkable = (zone: string) => !zone.startsWith('training_');
  for (const [type, biome] of Object.entries(biomes)) {
    const map = maps.get(biome.map);
    if (!map || !walkable(biome.map)) continue;
    const doors = [...new Set(map.doors.map((d) => d.to.zone))].filter((z) => walkable(z) && mine.has(z)).sort();
    const linked = [
      ...new Set([
        ...biome.links,
        ...Object.values(biomes).flatMap((b) => (b.links.includes(biome.map) ? [b.map] : [])),
      ]),
    ]
      .filter(walkable)
      .sort();
    if (doors.join() !== linked.join())
      errors.push(
        `biomes.${type}.links: linked to [${linked.join(', ')}], but its doors lead to [${doors.join(', ')}]`,
      );
    for (const d of map.doors)
      if (!mine.has(d.to.zone))
        errors.push(`map "${biome.map}" has a door to "${d.to.zone}", not a map of this campaign`);
  }

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

/** Check every campaign (a map no campaign draws from is an error too). Each report line names its campaign. */
export function checkCampaigns(maps: Map<string, MapData>): ContentReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();
  for (const campaign of campaigns()) {
    let content: ContentManager;
    try {
      content = loadContentFromDisk(campaign);
    } catch (err) {
      errors.push(`${campaign}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const b of Object.values(content.content.biomes)) used.add(b.map);
    const r = checkContent(content, maps);
    errors.push(...r.errors.map((e) => `${campaign}: ${e}`));
    warnings.push(...r.warnings.map((w) => `${campaign}: ${w}`));
  }
  for (const name of maps.keys()) if (!used.has(name)) errors.push(`map "${name}" is in no campaign's biomes.json`);
  return { errors, warnings };
}

/** Write each biome's `tilesets` from its map (what the map build decided), keeping the rest of biomes.json as it is. */
export async function syncTilesets(maps: Map<string, MapData>, campaign: string): Promise<string[]> {
  const file = readContentFile('biomes', campaign) as {
    biomes?: Record<string, { map?: string; tilesets?: string[] }>;
  };
  const changed: string[] = [];
  for (const [type, biome] of Object.entries(file.biomes ?? {})) {
    const map = biome.map && maps.get(biome.map);
    if (!map || (biome.tilesets && sameList(biome.tilesets, map.sheets))) continue;
    biome.tilesets = [...map.sheets];
    changed.push(type);
  }
  if (changed.length) {
    const target = path.join(CONTENT_DIR, campaign, 'biomes.json');
    const options = (await prettier.resolveConfig(target)) ?? {};
    fs.writeFileSync(target, await prettier.format(JSON.stringify(file), { ...options, filepath: target }));
  }
  return changed;
}
