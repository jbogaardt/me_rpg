// One-off: rewrite a campaign's flat quests.json (the older form) as one epic file (src/content/story.ts).
//   npx tsx tools/content/migrateStory.ts campaign1 "The Stilled Hour" stilled_hour
// The test beside this (story.test.ts) holds the result to the original: the new file compiles back to exactly it.
import fs from 'node:fs';
import path from 'node:path';
import { joinStory, type Json } from '../../src/content/story';
import { CONTENT_DIR } from './disk';

const [campaign, title, id] = process.argv.slice(2);
if (!campaign || !title || !id) throw new Error('usage: migrateStory.ts <campaign> "<story title>" <story_id>');
const file = path.join(CONTENT_DIR, campaign, 'quests.json');
const flat = JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
if (flat.epics !== undefined) throw new Error(`${campaign} is already in the epic form`);
fs.writeFileSync(file, `${JSON.stringify(joinStory(flat, { id, title }), null, 2)}\n`);
console.log(`${campaign}: quests.json is now the epic "${title}"`);
