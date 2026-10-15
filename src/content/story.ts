// A campaign's quests.json in the one epic format (Pixi-free, tested; content layer). The file holds everything a story
// is made of: its `people` (who give quests and what they say when they have nothing to do with one), its `sites`, its
// `welcome` and `epilogue`, and its `epics`. An epic with `"scope": "hero"` is the campaign's own story, played by each
// hero through the quest log: chapters, each a few steps (quests) told by the people, with the same words a person says
// at every stage (offer, remind, done). An epic with `"scope": "party"` (the default) is a saga the Dungeon Master tells
// the whole party (systems/dmEpics.ts). One file, one vocabulary, so a story is written in one place whether it is played
// alone, by a party, or both.
//
// `splitStory` turns the file into what the rest of the content reads: the flat quests file `parseQuests` has always
// read (so every check and every engine reader is unchanged) and the party epics. A file without `epics` is the older flat
// form (the generators of random and live worlds still write it) and passes through unchanged.

export type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface Story {
  /** The flat quests file for `parseQuests`. */
  quests: unknown;
  /** The party epics, raw, for `parseEpics`. */
  epics: unknown[];
  /** What is wrong with the shape of the file (what `parseQuests` and `parseEpics` cannot see). */
  problems: string[];
}

/** Read a quests.json of either form. */
export function splitStory(file: unknown): Story {
  if (!isObject(file) || file.epics === undefined) return { quests: file, epics: [], problems: [] };
  const problems: string[] = [];
  if (!Array.isArray(file.epics)) return { quests: file, epics: [], problems: ['quests.json.epics: must be an array'] };
  const heroes: Json[] = [];
  const epics: unknown[] = [];
  for (const [i, e] of file.epics.entries()) {
    if (!isObject(e)) problems.push(`quests.json.epics[${i}]: must be an object`);
    else if (e.scope === 'hero') heroes.push(e);
    else if (e.scope === undefined || e.scope === 'party') epics.push(e);
    else problems.push(`quests.json.epics[${i}].scope: must be "hero" or "party"`);
  }
  if (heroes.length !== 1)
    problems.push(
      `quests.json.epics: exactly one epic has "scope": "hero" (the campaign's story), found ${heroes.length}`,
    );
  const story = heroes[0];
  const chapters: unknown[] = [];
  const quests: unknown[] = [];
  if (story) {
    const list = Array.isArray(story.chapters) ? story.chapters : [];
    if (!Array.isArray(story.chapters)) problems.push('quests.json.epics[story].chapters: must be an array');
    for (const [c, ch] of list.entries()) {
      if (!isObject(ch)) {
        problems.push(`quests.json.epics[story].chapters[${c}]: must be an object`);
        continue;
      }
      const { steps, ...chapter } = ch;
      chapters.push(chapter);
      if (!Array.isArray(steps)) problems.push(`quests.json.epics[story].chapters[${c}].steps: must be an array`);
      else for (const s of steps) quests.push(isObject(s) ? { ...s, chapter: c } : s);
    }
  }
  return {
    quests: {
      version: file.version,
      welcome: file.welcome,
      giver: story?.giver,
      givers: file.people,
      sites: file.sites,
      chapters,
      quests,
      epilogue: file.epilogue,
    },
    epics,
    problems,
  };
}

/**
 * The reverse, for moving a flat quests file into the epic form (tools/content/migrateStory.ts, and the test that holds
 * the two to each other): the story becomes one `hero` epic, its chapters holding their quests.
 */
export function joinStory(flat: Json, story: { id: string; title: string }, party: unknown[] = []): Json {
  const quests = (Array.isArray(flat.quests) ? flat.quests : []) as Json[];
  const chapters = ((Array.isArray(flat.chapters) ? flat.chapters : []) as Json[]).map((ch, i) => ({
    ...ch,
    steps: quests.filter((q) => q.chapter === i).map(({ chapter: _chapter, ...step }) => step),
  }));
  const out: Json = { version: flat.version };
  if (flat.welcome !== undefined) out.welcome = flat.welcome;
  out.people = flat.givers;
  if (flat.sites !== undefined) out.sites = flat.sites;
  out.epics = [{ id: story.id, scope: 'hero', title: story.title, giver: flat.giver, chapters }, ...party];
  if (flat.epilogue !== undefined) out.epilogue = flat.epilogue;
  return out;
}
