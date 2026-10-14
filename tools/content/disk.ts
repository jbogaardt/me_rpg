// The content read straight from public/content/<campaign>/ (Node: the tools and the tests, which have no web server).
import fs from 'node:fs';
import path from 'node:path';
import { ContentManager } from '../../src/content/ContentManager';
import { CONTENT_FILES, parseContent, type ContentFile } from '../../src/content/schema';

export const CONTENT_DIR = path.resolve(import.meta.dirname, '../../public/content');

/** The campaign the unit tests and the map tools assume unless told otherwise: the world the engine was built on. */
export const DEFAULT_CAMPAIGN = 'campaign1';

/** Every campaign there is: the folders of public/content/. */
export const campaigns = (): string[] =>
  fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => fs.statSync(path.join(CONTENT_DIR, f)).isDirectory())
    .sort();

/** One content file's JSON, as written. */
export const readContentFile = (file: ContentFile, campaign = DEFAULT_CAMPAIGN): unknown =>
  JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, campaign, `${file}.json`), 'utf8'));

/** A campaign's content, validated (throws a ContentError listing every problem). */
export function loadContentFromDisk(campaign = DEFAULT_CAMPAIGN): ContentManager {
  const files = Object.fromEntries(CONTENT_FILES.map((f) => [f, readContentFile(f, campaign)])) as Record<
    ContentFile,
    unknown
  >;
  return new ContentManager(parseContent(files));
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
  return campaigns().find((c) => {
    const biomes = (readContentFile('biomes', c) as { biomes?: Record<string, { map?: string }> }).biomes ?? {};
    return Object.values(biomes).some((b) => b.map === map);
  });
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
