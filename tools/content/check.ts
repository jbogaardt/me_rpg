// Checks the content (public/content/*.json) against the built maps: every biome draws from a map that exists, with
// the map's tilesets and weather; every scenario puts its people and its arrival on open ground of its own biome; every
// roam rule finds room. Run by `npm run map -- check` (and so by `verify` and `build`); `npm run map -- build` also
// writes each biome's tilesets from its map (`syncTilesets`).
import fs from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { roam } from '../../src/content/populate';
import { OPPOSITE } from '../../src/content/packs';
import { onDoor } from '../../src/map/doors';
import { bandKind } from '../../src/systems/bands';
import { bandText, foeProblem } from '../../src/systems/levels';
import type { ContentManager } from '../../src/content/ContentManager';
import type { MapData } from '../../src/map/types';
import { campaigns, CONTENT_DIR, loadContentFromDisk, PACKS, readContentFile, readPacks } from './disk';

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
  if (map.doors.some((d) => onDoor(d, col, row)) || map.ports.some((p) => onDoor(p, col, row))) return 'is on a door';
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
    // a shopkeeper runs one of this campaign's shops (a pack's rooms run the packs' shops, campaign 1's its own)
    for (const sh of map.shops)
      if (!content.content.items.shops[sh.shop])
        errors.push(`biomes.${type}: ${biome.map}'s shopkeeper runs "${sh.shop}", which is no shop in items.json`);
    if (!map.indoor && biome.climate !== map.climate)
      errors.push(`biomes.${type}.climate is "${biome.climate}", the map's spec says "${map.climate}"`);
    biome.generation.roam?.forEach((rule, i) => {
      const placed = roam(map, rule).length;
      if (placed < rule.count)
        warnings.push(`biomes.${type}.generation.roam[${i}] places ${placed} of ${rule.count}: not enough open ground`);
    });
  }
  // A zone with a level band holds only foes that are a fair fight at its lowest level (systems/levels.ts): its roamers
  // and the mobs its scenario places (a group banded to its own level, systems/bands.ts, is judged at that level). A foe that is no fight at the top of the band is only a warning.
  const { entities } = content.content;
  for (const [type, biome] of Object.entries(biomes)) {
    if (!biome.levels) continue;
    // each foe with the level it is banded to (systems/bands.ts), if any: a banded foe is judged by its made body
    const foes = new Map<string, { kind: string; level?: number }>();
    for (const rule of biome.generation.roam ?? [])
      for (const kind of rule.kinds) foes.set(`${kind}@${rule.level ?? ''}`, { kind, level: rule.level });
    for (const p of scenarios.nodes.get(type)?.entities ?? [])
      foes.set(`${p.entity}@${p.level ?? ''}`, { kind: p.entity, level: p.level });
    for (const { kind, level } of foes.values()) {
      const def = entities[kind];
      if (def?.type !== 'mob' || def.boss) continue;
      const banded = level === undefined ? undefined : bandKind(content.mobKind(kind), level);
      const stats = banded ? { hp: banded.maxHp, attack: banded.attack, defense: banded.defense } : def.stats;
      const problem = stats && foeProblem(stats, level === undefined ? biome.levels : [level, level]); // a banded group is judged at its own level: it is the deep end of the zone
      if (!problem) continue;
      const what = `biomes.${type} (${bandText(biome.levels)}): ${kind}${level === undefined ? '' : ` banded ${level}`} ${
        problem.kind === 'deadly'
          ? `kills a level-${problem.level} hero in ${problem.hits} hits (${problem.blows} blows to fell it)`
          : problem.kind === 'slog'
            ? `takes a level-${problem.level} hero ${problem.blows} blows to fell`
            : `falls to a level-${problem.level} hero in ${problem.blows} blows and needs ${problem.hits} hits to fell one`
      }`;
      (problem.kind === 'trivial' ? warnings : errors).push(what);
    }
  }
  // The links are the doors: every zone a map has a door to (in this campaign) is linked, and nothing else, except that
  // the training halls are reached by the trainer's magic, so only their way out is a door and nothing links to them.
  const walkable = (zone: string) => !zone.startsWith('training_');
  for (const [type, biome] of Object.entries(biomes)) {
    const raw = maps.get(biome.map);
    if (!raw) continue;
    // Ports: each binding names a port of this map and one of the map it leads to.
    for (const [name, to] of Object.entries(biome.ports)) {
      if (!raw.ports.some((p) => p.name === name))
        errors.push(`biomes.${type}.ports.${name}: ${biome.map} has no such port`);
      const there = maps.get(to.map);
      const far = there?.ports.find((p) => p.name === to.port);
      if (there && !far) errors.push(`biomes.${type}.ports.${name}: ${to.map} has no port "${to.port}"`);
      // Leave by the north, arrive in the south: a binding joins ports on opposite edges.
      const near = raw.ports.find((p) => p.name === name);
      if (near && far && OPPOSITE[near.side] !== far.side)
        errors.push(
          `biomes.${type}.ports.${name}: joins its ${near.side} edge to the ${far.side} edge of ${to.map}; a port leads to the opposite edge`,
        );
    }
    if (!walkable(biome.map)) continue;
    const map = content.wire(biome.map, raw); // the doors as the game has them, ports included
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
  // The story can be done: a gather quest's zone has enough of its sites, and a kill quest's mob lives where it says.
  const mapOf = new Map(Object.values(biomes).map((b) => [b.map, b] as const));
  const livesIn = (map: string): Set<string> => {
    const biome = mapOf.get(map);
    const kinds = new Set(biome?.generation.roam?.flatMap((r) => r.kinds) ?? []);
    for (const node of scenarios.nodes.values())
      if (biomes[node.biome_type]?.map === map) for (const p of node.entities) kinds.add(p.entity);
    return kinds;
  };
  for (const quest of content.content.quests.quests) {
    const o = quest.objective;
    const at = `quests.${quest.id}.objective`;
    if (o.t === 'gather') {
      const sites = maps.get(o.zone)?.sites.filter((s) => s.kind === o.site).length ?? 0;
      if (sites < o.count) errors.push(`${at}: wants ${o.count} ${o.site} sites, ${o.zone} has ${sites}`);
    } else if (o.t === 'kill') {
      const zones = o.zone ? [o.zone] : [...mapOf.keys()];
      if (!zones.some((z) => livesIn(z).has(o.kind)))
        errors.push(`${at}: no "${o.kind}" lives in ${o.zone ?? 'any zone'} to defeat`);
    } else if (o.t === 'boss') {
      // a named boss stands exactly once, placed by a scenario node of its zone (never a roamer: it would not be one)
      const placed = [...scenarios.nodes.values()]
        .filter((n) => biomes[n.biome_type]?.map === o.zone)
        .flatMap((n) => n.entities.filter((p) => p.entity === o.boss));
      if (placed.length !== 1)
        errors.push(`${at}: "${o.boss}" must be placed once in ${o.zone}, found ${placed.length}`);
      if (mapOf.get(o.zone)?.generation.roam?.some((r) => r.kinds.includes(o.boss)))
        errors.push(`${at}: "${o.boss}" is a boss and cannot roam ${o.zone}`);
    } else if (o.t === 'visit') {
      if (!maps.get(o.zone)?.places.some((p) => p.name === o.place))
        errors.push(`${at}: ${o.zone} has no place called "${o.place}" (z.place)`);
    }
  }
  // Everyone the story names stands in the zone it says (z.giver in that map), so the arrow and the talk find them.
  for (const [id, g] of Object.entries(content.content.quests.givers)) {
    if (maps.has(g.zone) && !maps.get(g.zone)?.givers.some((s) => s.giver === id))
      errors.push(`givers.${id}: ${g.zone} has nobody placed as "${id}" (z.giver)`);
  }
  return { errors, warnings };
}

/** How many seeds `checkCampaigns` assembles from the packs: each must make a campaign that passes every check. */
export const CHECKED_SEEDS = 40;

/**
 * Check every campaign, the packs' regions (all of them, `PACKS`) and the random campaigns of seeds 1 to
 * `CHECKED_SEEDS` (a map no campaign or pack draws from is an error too). Each report line names its campaign.
 */
export function checkCampaigns(maps: Map<string, MapData>): ContentReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();
  const seeds = Array.from({ length: CHECKED_SEEDS }, (_, i) => `random:${i + 1}`);
  for (const campaign of [...campaigns(), PACKS, ...seeds]) {
    let content: ContentManager;
    try {
      content = loadContentFromDisk(campaign);
    } catch (err) {
      errors.push(`${campaign}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const b of Object.values(content.content.biomes)) used.add(b.map);
    const r = checkContent(content, maps);
    const seeded = campaign.startsWith('random:');
    errors.push(...r.errors.map((e) => `${campaign}: ${e}`));
    // A seed's roam rules are the packs' (warned about once, under PACKS).
    if (!seeded) warnings.push(...r.warnings.map((w) => `${campaign}: ${w}`));
  }
  // A pack region's ports are its map's, on the edges it says.
  for (const pack of readPacks())
    for (const [id, region] of Object.entries(pack.regions ?? {})) {
      const map = maps.get(region.biome.map);
      if (!map) continue;
      const at = `${PACKS}: ${pack.id}.regions.${id}.ports`;
      const declared = Object.entries(region.ports)
        .map(([n, side]) => `${n}:${side}`)
        .sort();
      const actual = map.ports.map((p) => `${p.name}:${p.side}`).sort();
      if (declared.join() !== actual.join())
        errors.push(`${at}: [${declared.join(', ')}], but ${region.biome.map} has [${actual.join(', ')}]`);
    }
  for (const name of maps.keys()) if (!used.has(name)) errors.push(`map "${name}" is in no campaign's biomes.json`);
  return { errors, warnings };
}

/** Write each pack region's `biome.tilesets` from its map, keeping the rest of the pack file as it is. */
export async function syncPackTilesets(maps: Map<string, MapData>): Promise<string[]> {
  const changed: string[] = [];
  for (const pack of readPacks()) {
    let dirty = false;
    for (const [id, region] of Object.entries(pack.regions ?? {})) {
      const map = maps.get(region.biome.map);
      if (!map || sameList(region.biome.tilesets, map.sheets)) continue;
      region.biome.tilesets = [...map.sheets];
      changed.push(`${pack.id}.${id}`);
      dirty = true;
    }
    for (const [id, region] of Object.entries(pack.regions ?? {}))
      for (const [roomId, room] of Object.entries(region.rooms ?? {})) {
        const map = maps.get(room.map);
        if (!map || sameList(room.tilesets, map.sheets)) continue;
        room.tilesets = [...map.sheets];
        changed.push(`${pack.id}.${id}.rooms.${roomId}`);
        dirty = true;
      }
    if (!dirty) continue;
    const target = path.join(CONTENT_DIR, PACKS, `${pack.id}.json`);
    const options = (await prettier.resolveConfig(target)) ?? {};
    fs.writeFileSync(target, await prettier.format(JSON.stringify(pack), { ...options, filepath: target }));
  }
  return changed;
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
