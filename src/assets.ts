import { Assets, type Texture } from 'pixi.js';
import { parseMap, type MapData } from './map/types';
import { allHeroOutfits, NPC_LOOKS } from './systems/looks';
import { MOB_KINDS } from './systems/combat';
import { outfitParts, type Outfit, type PartManifest } from './sprites/doll';
import { Wardrobe } from './sprites/Wardrobe';

// All game assets go through the Pixi `Assets` cache: character part sheets (see sprites/Wardrobe.ts) loaded at boot,
// and one bundle per zone (its map JSON, then the tilesets that JSON names) loaded when the zone is entered.

const BASE = import.meta.env.BASE_URL;
const tilesetUrl = (file: string) => `${BASE}tilesets/${file}`;
// The build id in the query string stops a CDN/browser from serving yesterday's map next to today's code.
const zoneUrl = (zone: string) => `${BASE}maps/${zone}.json?v=${__BUILD_ID__}`;

/** A loaded bundle entry, or a clear error instead of an undefined texture later. */
function pick(loaded: Record<string, Texture>, key: string): Texture {
  const texture = loaded[key];
  if (!texture) throw new Error(`Asset "${key}" did not load`);
  return texture;
}

export type Progress = (fraction: number) => void;

export interface Sprites {
  /** Composes character sheets from loaded sprite parts (hero gear, NPC looks, mob kinds). */
  wardrobe: Wardrobe;
}

const LPC_DIR = `${BASE}sprites/lpc/`;

/** Every sprite part the game can show without further loading: hero gear, NPC looks and every mob kind. */
function requiredParts(): Set<string> {
  const outfits: Outfit[] = [
    ...allHeroOutfits(),
    ...Object.values(NPC_LOOKS),
    ...Object.values(MOB_KINDS).map((k) => k.look),
  ];
  return new Set(outfits.flatMap(outfitParts));
}

/** Initialise the asset cache. Call once, before any load. */
export async function initAssets() {
  await Assets.init({});
}

/** Load the character part manifest and the art for everything in `requiredParts()`, then return the wardrobe. */
export async function loadSprites(onProgress?: Progress): Promise<Sprites> {
  Assets.add({ alias: 'sprites:parts', src: `${LPC_DIR}parts.json?v=${__BUILD_ID__}`, parser: 'json' });
  const manifest = await Assets.load<PartManifest>('sprites:parts');
  const wardrobe = new Wardrobe(manifest, LPC_DIR, `?v=${__BUILD_ID__}`);
  await wardrobe.load(requiredParts(), onProgress);
  return { wardrobe };
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
