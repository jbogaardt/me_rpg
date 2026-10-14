// The content files read straight from public/content/ (Node: the tools and the tests, which have no web server).
import fs from 'node:fs';
import path from 'node:path';
import { ContentManager } from '../../src/content/ContentManager';
import { CONTENT_FILES, parseContent, type ContentFile } from '../../src/content/schema';

export const CONTENT_DIR = path.resolve(import.meta.dirname, '../../public/content');

/** One content file's JSON, as written. */
export const readContentFile = (file: ContentFile): unknown =>
  JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, `${file}.json`), 'utf8'));

/** The content, validated (throws a ContentError listing every problem). */
export function loadContentFromDisk(): ContentManager {
  const files = Object.fromEntries(CONTENT_FILES.map((f) => [f, readContentFile(f)])) as Record<ContentFile, unknown>;
  return new ContentManager(parseContent(files));
}

/** Load the content and hand it to the rule modules (MOB_KINDS, NPC_LOOKS), as the game does at boot. */
export function installContentFromDisk(): ContentManager {
  const content = loadContentFromDisk();
  content.install();
  return content;
}
