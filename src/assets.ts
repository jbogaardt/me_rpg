import { Assets, type Texture } from 'pixi.js';
import versions from 'virtual:asset-versions';
import { parseMap, type MapData } from './map/types';
import { allPlayerOutfits, NPC_LOOKS } from './systems/looks';
import { type PetSheet } from './systems/pets';
import { MOB_KINDS } from './systems/combat';
import { outfitParts, type Outfit, type PartManifest } from './sprites/doll';
import { Wardrobe } from './sprites/Wardrobe';
import { installItemSheet } from './entities/itemArt';
import { AssembledSource } from './content/AssembledSource';
import { LiveSource } from './content/LiveSource';
import type { ContentSource } from './content/ContentManager';
import type { ContentFile } from './content/schema';

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

/** A campaign's content (public/content/<campaign>/*.json) served as static files: the source ContentManager reads at boot. */
export const staticContent = (campaign: string): ContentSource => ({
  fetch(file: ContentFile) {
    const alias = `content:${campaign}:${file}`;
    register(alias, publicUrl(`content/${campaign}/${file}.json`), 'json');
    return Assets.load(alias);
  },
});

/** A random campaign assembled with `seed` from the packs (public/content/packs/, src/content/packs.ts). */
export const packContent = (seed: number): AssembledSource =>
  new AssembledSource(seed, (name) => {
    const alias = `content:packs:${name}`;
    register(alias, publicUrl(`content/packs/${name}.json`), 'json');
    return Assets.load(alias);
  });

/** A live world opened with `seed` (and `arc`, if named) from the packs, grown during play (content/world.ts). */
export const liveContent = (seed: number, arc?: string): LiveSource =>
  new LiveSource(
    seed,
    (name) => {
      const alias = `content:packs:${name}`;
      register(alias, publicUrl(`content/packs/${name}.json`), 'json');
      return Assets.load(alias);
    },
    arc,
  );

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
  /** Grave marker art (public/tilesets/graves.png, the same sheet the maps use): the grave landmark (entities/Landmark.ts). */
  graves: Texture;
  /** Ruined pillars, idols and walls (public/tilesets/ruins.png): the `ruin` landmark is drawn from it (entities/Landmark.ts). */
  ruins: Texture;
  /** The other landmarks' pixel art (public/tilesets/landmarks.png, tools/map/landmarks.ts). */
  landmarks: Texture;
  /** The dog and cat sheets (public/sprites/pets/), see systems/pets.ts. */
  pets: Record<PetSheet, Texture>;
}

const LPC_DIR = 'sprites/lpc/';

/** Every sprite part the game can show without further loading: hero gear, NPC looks and every mob kind. */
function requiredParts(extra: Outfit[]): Set<string> {
  const outfits: Outfit[] = [
    ...extra,
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
/** `extra`: looks to load beyond the installed content's (a live world's, which may come to need any pack's). */
export async function loadSprites(onProgress?: Progress, extra: Outfit[] = []): Promise<Sprites> {
  Assets.add({ alias: 'sprites:parts', src: publicUrl(`${LPC_DIR}parts.json`), parser: 'json' });
  const manifest = await Assets.load<PartManifest>('sprites:parts');
  const wardrobe = new Wardrobe(manifest, (file) => publicUrl(LPC_DIR + file));
  await wardrobe.load(requiredParts(extra), onProgress);
  Assets.add({ alias: 'sprites:chests', src: tilesetUrl('chests.png') });
  Assets.add({ alias: 'sprites:crops', src: tilesetUrl('crops.png') });
  Assets.add({ alias: 'sprites:graves', src: tilesetUrl('graves.png') });
  Assets.add({ alias: 'sprites:ruins', src: tilesetUrl('ruins.png') });
  Assets.add({ alias: 'sprites:landmarks', src: tilesetUrl('landmarks.png') });
  const pets = {} as Record<PetSheet, Texture>;
  for (const sheet of ['dogs', 'cats', 'rat'] as const) {
    Assets.add({ alias: `sprites:pets:${sheet}`, src: publicUrl(`sprites/pets/${sheet}.png`) });
    pets[sheet] = await Assets.load<Texture>(`sprites:pets:${sheet}`);
  }
  // The item sheet: a Pixi texture for the ground items and relics, and a CSS variable for the DOM icons (hud/itemIcons.ts).
  const itemSrc = publicUrl('sprites/items/items.png');
  Assets.add({ alias: 'sprites:items', src: itemSrc });
  installItemSheet(await Assets.load<Texture>('sprites:items'));
  // Absolute: a relative url() in a custom property is read against the stylesheet that uses it (assets/), not the page.
  document.documentElement.style.setProperty('--item-sheet', `url("${new URL(itemSrc, document.baseURI).href}")`);
  return {
    wardrobe,
    chests: await Assets.load<Texture>('sprites:chests'),
    crops: await Assets.load<Texture>('sprites:crops'),
    graves: await Assets.load<Texture>('sprites:graves'),
    ruins: await Assets.load<Texture>('sprites:ruins'),
    landmarks: await Assets.load<Texture>('sprites:landmarks'),
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
 * counted, see `unloadZone`). Progress covers the tilesets. `tilesets` (the biome's list in the content, which the map
 * build keeps equal to the map's) start loading at once, alongside the map JSON, instead of after it.
 */
export async function loadZone(name: string, onProgress?: Progress, tilesets?: string[]): Promise<Zone> {
  const dataAlias = `zone:${name}:data`;
  register(dataAlias, zoneUrl(name), 'json');
  for (const sheet of tilesets ?? []) {
    register(tilesetAlias(sheet), tilesetUrl(sheet));
    void Assets.load<Texture>(tilesetAlias(sheet)).catch(() => {}); // a head start only: the real load below reports failures
  }
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
