// What a player's words are about (Pixi-free, tested; core engine): the one vocabulary both Jev workflows speak. The live
// one (the DM bot, per utterance, in the game) tags what a player says with a kind and how much it matters; the triage one
// (after the game) reads those tags again, adds the ones the live pass left out, and ranks the whole game's findings. A
// keyword tagger stands in when there is no Jev key, so the pipeline always runs. A tag is advice for people reading a
// report: it never changes the world, and an unsure tag is only ever a question put back to the player.
// Players are P1, P2...; nothing here names anyone.

import { REQUESTS } from './dmRequests';
import type { ReportEntry } from './reportLog';

/** What a player's words can be about. */
export const FEEDBACK_KINDS = [
  'bug',
  'too_hard',
  'too_easy',
  'confusing',
  'pace',
  'request',
  'praise',
  'other',
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Each kind in plain words (what a classifier is told it means). */
export const KIND_MEANING: Record<FeedbackKind, string> = {
  bug: 'something is broken: a crash, being stuck in a wall, a thing that does not work or disappears',
  too_hard: 'a fight or area is too hard: dying, being overwhelmed, unfair enemies',
  too_easy: 'it is too easy: no challenge, enemies fall at once, nothing to fear',
  confusing: 'the player does not know where to go or what to do, or does not understand a rule',
  pace: 'it is slow or empty: boring stretches, waiting, nothing happening, too much walking',
  request: 'a wish for something new: a quest, an item, a change they would like',
  praise: 'something they liked or found fun',
  other: 'none of these, or too little to tell',
};

/** How much it matters to the player's enjoyment, 0 to 3. */
export const SEVERITY_LEVELS = [
  'not a problem at all',
  'a small annoyance',
  'it gets in the way of enjoying the game',
  'it stops the player from playing on',
] as const;

export interface Tag {
  kind: FeedbackKind;
  /** 0 to 3, an index into `SEVERITY_LEVELS`. */
  severity: number;
  /** 0 to 1: how sure the tagger is. */
  confidence: number;
  /** Who decided: Jev, the keyword rules, or the ask itself (a canned ask or a tapped face says what it is). */
  by: 'jev' | 'rules' | 'ask';
}

/** The kinds that are complaints (what a triage ranks, and what a follow-up question may be asked about). */
export const COMPLAINTS: readonly FeedbackKind[] = ['bug', 'too_hard', 'too_easy', 'confusing', 'pace'];

/** What each canned ask means (`REQUESTS` in dmRequests.ts, by label). */
const ASK_KIND: Record<string, Pick<Tag, 'kind' | 'severity'>> = {
  'We are lost': { kind: 'confusing', severity: 2 },
  'This is too hard': { kind: 'too_hard', severity: 2 },
  'This is too easy': { kind: 'too_easy', severity: 1 },
  'Give us a quest': { kind: 'pace', severity: 1 },
  'Give us an epic quest': { kind: 'pace', severity: 1 },
  'Change the weather': { kind: 'request', severity: 0 },
  'Let us move on': { kind: 'pace', severity: 2 },
};

/** The tag of a canned ask, a tapped face, or null for words that need reading. */
export function givenTag(e: Pick<ReportEntry, 'kind' | 'text'>): Tag | null {
  if (e.kind === 'ask') {
    const k = ASK_KIND[e.text];
    return k ? { ...k, confidence: 1, by: 'ask' } : null;
  }
  if (e.kind === 'note') {
    if (e.text.includes('\u{1F600}')) return { kind: 'praise', severity: 0, confidence: 0.9, by: 'ask' };
    if (e.text.includes('\u{1F61E}')) return { kind: 'other', severity: 1, confidence: 0.9, by: 'ask' };
    if (e.text.includes('\u{1F610}')) return { kind: 'other', severity: 0, confidence: 0.6, by: 'ask' };
  }
  return null;
}

const RULES: [FeedbackKind, RegExp][] = [
  [
    'bug',
    /\b(bug|glitch|broken|crash\w*|froze|freez\w*|stuck in|can'?t move|cannot move|won'?t (open|work|move)|doesn'?t work|disappear\w*|softlock\w*|fell through)\b/i,
  ],
  [
    'too_hard',
    /\b(too hard|too difficult|impossible|unfair|keep dying|kills? me|killed me|can'?t beat|overwhelm\w*|too (strong|many)|brutal)\b/i,
  ],
  ['too_easy', /\b(too easy|so easy|boring|trivial|no challenge|no threat|walk ?over|piece of cake|too weak)\b/i],
  ['pace', /\b(slow|nothing to do|nothing happening|empty|waiting|too much walking|drags?|dull|bored)\b/i],
  [
    'confusing',
    /\b(lost|where (do|is|am|should|to)|how (do|can) i|what (do|should) i|don'?t (know|understand|get)|confus\w*|unclear|no idea)\b/i,
  ],
  ['praise', /\b(love|loved|fun|great|awesome|cool|nice|brilliant|fantastic|amazing|enjoy\w*)\b/i],
  ['request', /\b(can we|could (you|we)|please|i('d| would) (like|want)|add|give us|want)\b/i],
];
const WORST = /\b(crash\w*|can'?t move|cannot move|softlock\w*|impossible|keep dying|unplayable|stuck in)\b/i;
const MILD = /\b(a (bit|little)|slightly|kind of|sort of|maybe)\b/i;

/** The keyword tagger: a match is a fair guess (confidence 0.6), no match is `other` and unsure. */
export function ruleTag(text: string): Tag {
  const hit = RULES.find(([, re]) => re.test(text));
  if (!hit) return { kind: 'other', severity: 0, confidence: 0.3, by: 'rules' };
  const [kind] = hit;
  const severity = kind === 'praise' || kind === 'request' ? 0 : WORST.test(text) ? 3 : MILD.test(text) ? 1 : 2;
  return { kind, severity, confidence: 0.6, by: 'rules' };
}

/** What the DM asks a player whose complaint was too vague to act on (several wordings each; said privately, once). */
export const FOLLOW_UP_WORDS: Record<'bug' | 'too_hard' | 'too_easy' | 'confusing' | 'pace' | 'other', string[]> = {
  too_hard: [
    'Too hard, you say? Tell me where it bit you, friend: which foe, which place? I will have a word with the world.',
    'Ah. Something has been rude to you. Which creature, and where were you standing when it happened?',
  ],
  too_easy: [
    'Too easy? How scandalous. What fell over too quickly, and where? I shall find it something sterner to do.',
    'You find it a stroll? Tell me which foe, and where, and I will see about putting some teeth in it.',
  ],
  bug: [
    'Something is broken? Tell me what you were doing and where, friend, and I shall pass it on to the people with the hammers.',
    'A crack in the world, is it? What were you trying to do, and what happened instead?',
  ],
  confusing: [
    'Lost? It happens to the best of heroes. What were you trying to do, or where were you trying to go?',
    'Hm. The road has not been clear, has it? Tell me what you expected to happen, and I shall make a note.',
  ],
  pace: [
    'Slow going? Tell me when it dragged: was it the walking, the waiting, or nothing to do?',
    'Dull, you say? A dreadful sin in a storyteller. Where did it go quiet for you?',
  ],
  other: [
    'You look unhappy, friend. What went wrong? A word or two is plenty.',
    'Something is not right? Tell me where, and what, and I will see what can be done.',
  ],
};

/** Policy for asking back: a vague complaint, a sure tag, not too often, and only a few times a game. */
export const FOLLOW_UP_MIN_CONFIDENCE = 0.6;
export const FOLLOW_UP_VAGUE_WORDS = 7;
export const FOLLOW_UP_EVERY = 180;
export const FOLLOW_UP_MAX = 3;

export interface FollowUps {
  /** When (game seconds) each player was last asked back. */
  last: Map<number, number>;
  total: number;
}
export const newFollowUps = (): FollowUps => ({ last: new Map(), total: 0 });

/** The words of this entry, as a player's vagueness is judged (a canned ask or a face has none, so it is vague). */
const wordCount = (e: Pick<ReportEntry, 'kind' | 'text'>) =>
  e.kind === 'said' ? e.text.split(/\s+/).filter(Boolean).length : 0;

/** Should the DM ask this player back, and which wording bank? Null for no. Call `recordFollowUp` when it is asked. */
export function followUpFor(
  e: Pick<ReportEntry, 'kind' | 'text' | 'slot' | 't'>,
  tag: Tag,
  state: FollowUps,
): keyof typeof FOLLOW_UP_WORDS | null {
  const kind = tag.kind === 'other' && tag.by === 'ask' && tag.severity > 0 ? 'other' : tag.kind;
  if (kind !== 'other' && !COMPLAINTS.includes(kind)) return null;
  if (tag.confidence < FOLLOW_UP_MIN_CONFIDENCE) return null;
  if (wordCount(e) > FOLLOW_UP_VAGUE_WORDS) return null; // they said enough
  if (state.total >= FOLLOW_UP_MAX) return null;
  const last = state.last.get(e.slot);
  if (last !== undefined && e.t - last < FOLLOW_UP_EVERY) return null;
  return kind as keyof typeof FOLLOW_UP_WORDS;
}

export function recordFollowUp(state: FollowUps, slot: number, t: number) {
  state.last.set(slot, t);
  state.total++;
}

/** Every canned ask must have a meaning here; a new ask added to `REQUESTS` fails the test until it is given one. */
export const ASK_LABELS_COVERED = REQUESTS.every((r) => r.label in ASK_KIND);
