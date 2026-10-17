// Tagging what a player said (the DM bot, both Jev workflows): a canned ask or a tapped face says what it is; words are
// tagged by a `Tagger` (Jev with a key, the keyword rules without, or when Jev fails or is slow). The result is advice for a
// report (`Tag`, src/systems/feedback.ts); nothing here changes the game.

import { givenTag, ruleTag, type Tag } from '../src/systems/feedback';
import type { ReportEntry } from '../src/systems/reportLog';

export interface Tagger {
  tag(entry: ReportEntry): Promise<Tag>;
}

/** The keyword tagger (no key, no network): the floor every report stands on. */
export class RulesTagger implements Tagger {
  tag(entry: ReportEntry): Promise<Tag> {
    return Promise.resolve(ruleTag(entry.text));
  }
}

/** Seconds a tagger may take before the rules answer instead (the live pass must never hold up the table). */
export const TAG_TIMEOUT_MS = 6_000;

/** The kinds of entry whose words are tagged (a knockout, a nudge, a quest end say what they are). */
export const TAGGED = new Set(['said', 'ask', 'note']);

/**
 * The tag of an entry: what a canned ask or a face says, else the tagger's reading, else the rules'. Never rejects. Returns
 * null for entries that are not a player's words.
 */
export async function tagEntry(entry: ReportEntry, tagger: Tagger, timeoutMs = TAG_TIMEOUT_MS): Promise<Tag | null> {
  if (!TAGGED.has(entry.kind)) return null;
  const given = givenTag(entry);
  if (given) return given;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('the tagger was too slow')), timeoutMs),
    );
    return await Promise.race([tagger.tag(entry), timeout]);
  } catch {
    return ruleTag(entry.text);
  }
}
