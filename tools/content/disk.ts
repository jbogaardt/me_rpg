// The content read straight from public/content/<campaign>/ (Node: the tools and the tests, which have no web server).
import fs from 'node:fs';
import path from 'node:path';
import { ContentManager } from '../../src/content/ContentManager';
import { CONTENT_FILES, parseContent, type ContentFile } from '../../src/content/schema';
import { catalogCampaign, type Assembly, type Pack } from '../../src/content/packs';
import { assemble } from '../../src/content/world';
import type { PackIndex } from '../../src/content/AssembledSource';

export const CONTENT_DIR = path.resolve(import.meta.dirname, '../../public/content');

/** The campaign the unit tests and the map tools assume unless told otherwise: the world the engine was built on. */
export const DEFAULT_CAMPAIGN = 'campaign1';

/**
 * The packs random campaigns are assembled from (public/content/packs/, src/content/packs.ts). As a "campaign" name it
 * means every region of them at once with no story (`catalogCampaign`), which is what the map tools check a region's
 * map against; `random:<seed>` is one assembled campaign.
 */
export const PACKS = 'packs';

/** Every campaign there is: the folders of public/content/ (not the packs). */
export const campaigns = (): string[] =>
  fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f !== PACKS && fs.statSync(path.join(CONTENT_DIR, f)).isDirectory())
    .sort();

/** Every pack in the index, as written. */
export function readPacks(): Pack[] {
  const read = (name: string): unknown =>
    JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, PACKS, `${name}.json`), 'utf8'));
  return (read('index') as PackIndex).packs.map((id) => read(id) as Pack);
}

/** The random campaign a seed makes from the packs on disk. */
export const assembleFromDisk = (seed: number): Assembly => assemble(seed, readPacks());

/** The files of a campaign: a folder's, the packs' catalog, or a seed's assembly. */
function campaignFiles(campaign: string): Record<ContentFile, unknown> {
  if (campaign === PACKS) return catalogCampaign(readPacks());
  const seed = /^random:(\d+)$/.exec(campaign)?.[1];
  if (seed) return assembleFromDisk(Number(seed)).files;
  return Object.fromEntries(CONTENT_FILES.map((f) => [f, readContentFile(f, campaign)])) as Record<
    ContentFile,
    unknown
  >;
}

/** One content file's JSON, as written. */
export const readContentFile = (file: ContentFile, campaign = DEFAULT_CAMPAIGN): unknown =>
  JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, campaign, `${file}.json`), 'utf8'));

/** A campaign's content, validated (throws a ContentError listing every problem). */
export function loadContentFromDisk(campaign = DEFAULT_CAMPAIGN): ContentManager {
  return new ContentManager(parseContent(campaignFiles(campaign)));
}

let installed = '';

/** Load a campaign and hand it to the rule modules (MOB_KINDS, NPC_LOOKS, places, quests), as the game does at boot. */
export function installContentFromDisk(campaign = DEFAULT_CAMPAIGN): ContentManager {
  const content = loadContentFromDisk(campaign);
  content.install();
  installed = campaign;
  return content;
}

/** The campaign whose biomes draw from this map, if any. */
export function campaignOfMap(map: string): string | undefined {
  const owner = campaigns().find((c) => {
    const biomes = (readContentFile('biomes', c) as { biomes?: Record<string, { map?: string }> }).biomes ?? {};
    return Object.values(biomes).some((b) => b.map === map);
  });
  if (owner) return owner;
  const inPacks = readPacks().some((p) => Object.values(p.regions ?? {}).some((r) => r.biome.map === map));
  return inPacks ? PACKS : undefined;
}

/** Run `fn` with the campaign that owns `map` installed (map checks read its givers, sites and names), then put back what was. */
export function withCampaignOf<T>(map: string, fn: () => T): T {
  const before = installed || DEFAULT_CAMPAIGN;
  const campaign = campaignOfMap(map) ?? before;
  if (campaign !== installed) installContentFromDisk(campaign);
  try {
    return fn();
  } finally {
    if (installed !== before) installContentFromDisk(before);
  }
}
