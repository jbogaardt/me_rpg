import { Assets, type Texture } from 'pixi.js';
import versions from 'virtual:asset-versions';
import { parseMap, type MapData } from './map/types';
import { allPlayerOutfits, NPC_LOOKS } from './systems/looks';
import { type PetSheet } from './systems/pets';
import { MOB_KINDS } from './systems/combat';
import { outfitParts, type Outfit, type PartManifest } from './sprites/doll';
import { Wardrobe } from './sprites/Wardrobe';

// Game assets go through the Pixi `Assets` cache: the character part manifest at boot (the part layers themselves are
// plain images loaded by sprites/Wardrobe.ts), and one bundle per zone (its map JSON, then the tilesets that JSON names)
// loaded when the zone is entered.

const BASE = import.meta.env.BASE_URL;
/**
 * The URL of a file under public/, carrying a hash of its content (tools/assetVersions.ts): a deploy that changes a map
 * or a sheet changes its URL, so a cache never pairs new code with old art, and one that leaves a file alone keeps it
 * cached.
 */
const publicUrl = (path: string) => {
  const v = versions[path];
  return v ? `${BASE}${path}?v=${v}` : `${BASE}${path}`;
};
const tilesetUrl = (file: string) => publicUrl(`tilesets/${file}`);
const zoneUrl = (zone: string) => publicUrl(`maps/${zone}.json`);

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
  /** Treasure chest art (public/tilesets/chests.png): 2 columns (open, closed) by one row per chest kind. */
  chests: Texture;
  /** Crop plot art (public/tilesets/crops.png): a column per growth stage by one 32x64 row per crop (systems/crops.ts). */
  crops: Texture;
  /** The dog and cat sheets (public/sprites/pets/), see systems/pets.ts. */
  pets: Record<PetSheet, Texture>;
}

const LPC_DIR = 'sprites/lpc/';

/** Every sprite part the game can show without further loading: hero gear, NPC looks and every mob kind. */
function requiredParts(): Set<string> {
  const outfits: Outfit[] = [
    ...allPlayerOutfits(),
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
  Assets.add({ alias: 'sprites:parts', src: publicUrl(`${LPC_DIR}parts.json`), parser: 'json' });
  const manifest = await Assets.load<PartManifest>('sprites:parts');
  const wardrobe = new Wardrobe(manifest, (file) => publicUrl(LPC_DIR + file));
  await wardrobe.load(requiredParts(), onProgress);
  Assets.add({ alias: 'sprites:chests', src: tilesetUrl('chests.png') });
  Assets.add({ alias: 'sprites:crops', src: tilesetUrl('crops.png') });
  const pets = {} as Record<PetSheet, Texture>;
  for (const sheet of ['dogs', 'cats', 'rat'] as const) {
    Assets.add({ alias: `sprites:pets:${sheet}`, src: publicUrl(`sprites/pets/${sheet}.png`) });
    pets[sheet] = await Assets.load<Texture>(`sprites:pets:${sheet}`);
  }
  return {
    wardrobe,
    chests: await Assets.load<Texture>('sprites:chests'),
    crops: await Assets.load<Texture>('sprites:crops'),
    pets,
  };
}

export interface Zone {
  name: string;
  data: MapData;
  /** Tileset textures by file name (the names in `data.sheets`). */
  textures: Map<string, Texture>;
}

const added = new Set<string>(); // aliases registered with Assets (registering one twice only warns, but say it once)
function register(alias: string, src: string, parser?: string) {
  if (added.has(alias)) return;
  Assets.add(parser ? { alias, src, parser } : { alias, src });
  added.add(alias);
}
/** How many loaded zones use each tileset: a sheet is freed when the last zone using it is unloaded. */
const tilesetUsers = new Map<string, number>();
const tilesetAlias = (sheet: string) => `tileset:${sheet}`;

/**
 * Load a zone: its map JSON (validated), then the tilesets it names (shared with other zones: each is loaded once and
 * counted, see `unloadZone`). Progress covers the tilesets.
 */
export async function loadZone(name: string, onProgress?: Progress): Promise<Zone> {
  const dataAlias = `zone:${name}:data`;
  register(dataAlias, zoneUrl(name), 'json');
  const data = parseMap(await Assets.load(dataAlias));
  for (const sheet of data.sheets) {
    register(tilesetAlias(sheet), tilesetUrl(sheet));
    tilesetUsers.set(sheet, (tilesetUsers.get(sheet) ?? 0) + 1); // counted before loading, so no unload frees it meanwhile
  }
  const loaded = await Assets.load<Texture>(data.sheets.map(tilesetAlias), onProgress);
  return { name, data, textures: new Map(data.sheets.map((sheet) => [sheet, pick(loaded, tilesetAlias(sheet))])) };
}

/** Free a zone's map, and every tileset no other loaded zone uses. */
export async function unloadZone(zone: Zone) {
  await Assets.unload(`zone:${zone.name}:data`);
  for (const sheet of zone.data.sheets) {
    const users = (tilesetUsers.get(sheet) ?? 1) - 1;
    if (users > 0) {
      tilesetUsers.set(sheet, users);
      continue;
    }
    tilesetUsers.delete(sheet);
    await Assets.unload(tilesetAlias(sheet));
  }
}
