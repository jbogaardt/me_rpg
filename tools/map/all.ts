// Every zone in maps/, built: the shared code of `npm run map` (tools/map/cli.ts) and the zone tests.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MapData } from '../../src/map/types';
import { checkCrossings, checkDoors, checkMap, checkSeams, type Report } from './check';
import { ROOT } from './image';
import { buildWorld, World, type BiomeSpec, type WorldLayout } from './world';
import { buildSpec, Zone, type ZoneSpec } from './zone';
import { withCampaignOf } from '../content/disk';

export const MAPS_DIR = path.join(ROOT, 'maps');
/** maps/world.ts is the biome layout (tools/map/world.ts); every other file in maps/ is a zone or a biome. */
const LAYOUT = 'world';
const rel = (p: string) => path.relative(process.cwd(), p);

async function loadSpec(name: string): Promise<ZoneSpec | BiomeSpec> {
  const file = path.join(MAPS_DIR, `${name}.ts`);
  if (!fs.existsSync(file)) throw new Error(`No zone spec ${rel(file)}`);
  const mod = (await import(pathToFileURL(file).href)) as { default?: ZoneSpec | BiomeSpec };
  const spec = mod.default;
  if (spec?.name !== name)
    throw new Error(`${rel(file)} must default-export defineZone({ name: '${name}', ... }) or defineBiome(...)`);
  return spec;
}

export async function loadLayout(): Promise<WorldLayout> {
  const mod = (await import(pathToFileURL(path.join(MAPS_DIR, `${LAYOUT}.ts`)).href)) as { default: WorldLayout };
  return mod.default;
}

export function zoneNames(args: string[]): string[] {
  if (args.length) return args;
  return fs
    .readdirSync(MAPS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== `${LAYOUT}.ts`)
    .map((f) => f.slice(0, -3))
    .sort();
}

const isBiome = (s: ZoneSpec | BiomeSpec): s is BiomeSpec => 'walls' in s;

/** Every zone, built: rooms one by one, the biomes together as one world. Seams and doors are checked across all. */
export async function generateAll(): Promise<{
  zones: Map<string, { data: MapData; report: Report }>;
  errors: string[];
}> {
  const specs = await Promise.all(zoneNames([]).map(loadSpec));
  const zones = new Map<string, { data: MapData; report: Report }>();
  const layout = await loadLayout();
  for (const [name, { data, reasons }] of buildWorld(layout, specs.filter(isBiome)))
    zones.set(name, { data, report: withCampaignOf(name, () => checkMap(data, reasons)) });
  for (const spec of specs) {
    if (isBiome(spec)) continue;
    const z = new Zone(spec.width, spec.height);
    buildSpec(spec, z);
    const data = z.toMapData();
    zones.set(spec.name, { data, report: withCampaignOf(spec.name, () => checkMap(data, z.reasons)) });
  }
  const maps = new Map([...zones].map(([n, z]) => [n, z.data]));
  return { zones, errors: [...checkSeams(new World(layout), maps), ...checkDoors(maps), ...checkCrossings(maps)] };
}
