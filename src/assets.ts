import { Assets, type Texture } from 'pixi.js';
import { parseMap, type MapData } from './map/types';
import { MOB_KINDS } from './systems/combat';

// All game assets go through the Pixi Assets manifest: a static `sprites` bundle (characters) loaded at boot,
// and one bundle per zone (its map JSON, then the tilesets that JSON names) loaded when the zone is entered.

const BASE = import.meta.env.BASE_URL;
const spriteUrl = (file: string) => `${BASE}sprites/${file}`;
const tilesetUrl = (file: string) => `${BASE}tilesets/${file}`;
// The build id in the query string stops a CDN/browser from serving yesterday's map next to today's code.
const zoneUrl = (zone: string) => `${BASE}maps/${zone}.json?v=${__BUILD_ID__}`;

export const HERO_SHEET = 'healer_f.png'; // placeholder characters; swap a sheet of the same layout to re-skin
export const NPC_SHEET = 'warrior_m.png';

/** A loaded bundle entry, or a clear error instead of an undefined texture later. */
function pick(loaded: Record<string, Texture>, key: string): Texture {
  const texture = loaded[key];
  if (!texture) throw new Error(`Asset "${key}" did not load`);
  return texture;
}

export type Progress = (fraction: number) => void;

export interface Sprites {
  hero: Texture;
  npc: Texture;
  /** Mob sheets by MobKind.sheet file name. */
  mobs: Map<string, Texture>;
}

const mobSheets = () => [...new Set(Object.values(MOB_KINDS).map((k) => k.sheet))];

/** Register the manifest. Call once, before any load. */
export async function initAssets() {
  await Assets.init({
    manifest: {
      bundles: [
        {
          name: 'sprites',
          assets: [
            { alias: 'hero', src: spriteUrl(HERO_SHEET) },
            { alias: 'npc', src: spriteUrl(NPC_SHEET) },
            ...mobSheets().map((file) => ({ alias: `mob:${file}`, src: spriteUrl(file) })),
          ],
        },
      ],
    },
  });
}

export async function loadSprites(onProgress?: Progress): Promise<Sprites> {
  const loaded = (await Assets.loadBundle('sprites', onProgress)) as Record<string, Texture>;
  return {
    hero: pick(loaded, 'hero'),
    npc: pick(loaded, 'npc'),
    mobs: new Map(mobSheets().map((f) => [f, pick(loaded, `mob:${f}`)])),
  };
}

export interface Zone {
  name: string;
  data: MapData;
  /** Tileset textures by file name (the names in `data.sheets`). */
  textures: Map<string, Texture>;
}

/** Load a zone: its map JSON (validated), then its tileset bundle. Progress covers the tilesets. */
export async function loadZone(name: string, onProgress?: Progress): Promise<Zone> {
  const dataAlias = `zone:${name}:data`;
  Assets.add({ alias: dataAlias, src: zoneUrl(name), parser: 'json' });
  const data = parseMap(await Assets.load(dataAlias));

  const bundle = `zone:${name}`;
  Assets.addBundle(bundle, Object.fromEntries(data.sheets.map((sheet) => [`${bundle}:${sheet}`, tilesetUrl(sheet)])));
  const loaded = (await Assets.loadBundle(bundle, onProgress)) as Record<string, Texture>;
  return { name, data, textures: new Map(data.sheets.map((sheet) => [sheet, pick(loaded, `${bundle}:${sheet}`)])) };
}

/** Free a zone's map and tilesets. Don't unload a zone whose tilesets another loaded zone shares. */
export async function unloadZone(name: string) {
  await Assets.unloadBundle(`zone:${name}`);
  await Assets.unload(`zone:${name}:data`);
}
