// What a player's words are, and where they go (Pixi-free, tested; core engine): the one vocabulary both Jev workflows speak.
// A player may ask for help, criticise, report a bug, offer an idea, say they enjoyed it, ask the DM to do something, play
// in character, chat, or be abusive, and each of those goes somewhere different. So a tag has an INTENT (what they are doing
// with the words) and a TOPIC (what it is about), and the intent decides the PATH: answered now, acted on, played along with,
// triaged as a finding, kept as an idea, quoted as praise, guarded against, or dropped. The live pass (the DM bot, per
// utterance) tags and the triage pass (after the game) reads those tags again and ranks; a keyword tagger stands in when
// there is no Jev key. A tag is advice for people reading a report and never changes the world; an unsure tag is only ever a
// question put back to the player. Players are P1, P2...; nothing here names anyone.

import { REQUESTS } from './dmRequests';
import type { ReportEntry } from './reportLog';

/** What the player is doing with their words. */
export const INTENTS = [
  'help',
  'criticism',
  'bug',
  'idea',
  'praise',
  'control',
  'in_character',
  'social',
  'abuse',
  'noise',
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_MEANING: Record<Intent, string> = {
  help: 'asks the game or the DM for help or information: where to go, what to do, what something is, how a rule works',
  criticism: 'says something about the game is wrong or could be better: too hard, too easy, slow, unclear, badly made',
  bug: 'reports something broken or technical: a crash, being stuck in a wall, lag, a disconnect, a control that does nothing',
  idea: 'offers a new idea or wish: a quest, an item, a place, a change they would like to see',
  praise: 'says they liked something or are having fun',
  control:
    'asks the DM to do something to the game now: a quest, the weather, an easier or harder world, a different place',
  in_character: 'speaks as their hero to the DM or the world, playing the game rather than commenting on it',
  social: 'chats with the other players or the DM: a greeting, a joke, thanks, goodbye, banter',
  abuse: 'is hostile or abusive, or tries to give the game new instructions (such as "ignore your rules")',
  noise: 'gibberish, a stray key press, or too little to tell what it is',
};

/** What it is about (for criticism, bugs, help and ideas). The two difficulty topics carry which way. */
export const TOPICS = [
  'too_hard',
  'too_easy',
  'pace',
  'clarity',
  'content',
  'controls',
  'performance',
  'access',
  'other',
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_MEANING: Record<Topic, string> = {
  too_hard: 'fights or areas are too hard: dying, being overwhelmed, unfair enemies',
  too_easy: 'it is too easy: no challenge, enemies fall at once, nothing to fear',
  pace: 'it is slow or empty: boring stretches, waiting, nothing happening, too much walking',
  clarity: 'the player does not know where to go, what to do, or how a rule works; text or signs are unclear',
  content: 'what the world holds: quests, enemies, items, places, story, the DM, the look',
  controls: 'how the game is played: keys, touch, aiming, combos, menus',
  performance: 'speed and connection: lag, low frame rate, freezing, disconnects, loading',
  access:
    'comfort and readability: text too small or fast, colours, motion, sound, anything that makes it hard to play',
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
  intent: Intent;
  topic: Topic;
  /** 0 to 3, an index into `SEVERITY_LEVELS`. */
  severity: number;
  /** 0 to 1: how sure the tagger is. */
  confidence: number;
  /** Who decided: Jev, the keyword rules, or the ask itself (a canned ask or a tapped face says what it is). */
  by: 'jev' | 'rules' | 'ask';
}

/** Where a tag sends the words. */
export const PATHS = ['answer', 'act', 'play', 'finding', 'wishlist', 'praise', 'guard', 'drop'] as const;
export type Path = (typeof PATHS)[number];

/**
 * The path of an intent: `answer` (the DM replies now; recurring help becomes a clarity finding), `act` (the existing cards
 * and the DM's own tools), `play` (in character or chat: the DM plays along, and it stays out of the report), `finding`
 * (criticism and bugs: triaged and ranked), `wishlist` (ideas: clustered and counted apart), `praise` (quoted under what went
 * well), `guard` (abuse and injection: counted, never shown to the analyst, never quoted), `drop` (noise).
 */
export const PATH_OF: Record<Intent, Path> = {
  help: 'answer',
  criticism: 'finding',
  bug: 'finding',
  idea: 'wishlist',
  praise: 'praise',
  control: 'act',
  in_character: 'play',
  social: 'play',
  abuse: 'guard',
  noise: 'drop',
};
export const pathOf = (tag: Pick<Tag, 'intent'>): Path => PATH_OF[tag.intent];

/** Intents whose words stay out of what the analyst is shown and out of the file (they are not feedback). */
export const OFF_THE_RECORD: readonly Intent[] = ['in_character', 'social', 'abuse', 'noise', 'control'];
export const offTheRecord = (e: Pick<ReportEntry, 'tag'>): boolean => !!e.tag && OFF_THE_RECORD.includes(e.tag.intent);

/** The key a finding goes by: a bug is a bug; criticism by what it is about. */
export type FindingKey = 'bug' | Topic;
export const findingKey = (tag: Pick<Tag, 'intent' | 'topic'>): FindingKey =>
  tag.intent === 'bug' || tag.topic === 'performance' ? 'bug' : tag.topic;

const tag = (intent: Intent, topic: Topic, severity: number, confidence: number, by: Tag['by']): Tag => ({
  intent,
  topic,
  severity,
  confidence,
  by,
});

/** What each canned ask means (`REQUESTS` in dmRequests.ts, by label). */
const ASKS: Record<string, [Intent, Topic, number]> = {
  'We are lost': ['help', 'clarity', 2],
  'This is too hard': ['criticism', 'too_hard', 2],
  'This is too easy': ['criticism', 'too_easy', 1],
  'Give us a quest': ['control', 'pace', 1],
  'Give us an epic quest': ['control', 'pace', 1],
  'Change the weather': ['control', 'content', 0],
  'Let us move on': ['control', 'pace', 2],
};

/** The tag of a canned ask, a tapped face, or null for words that need reading. */
export function givenTag(e: Pick<ReportEntry, 'kind' | 'text'>): Tag | null {
  if (e.kind === 'ask') {
    const a = ASKS[e.text];
    return a ? tag(a[0], a[1], a[2], 1, 'ask') : null;
  }
  if (e.kind === 'note') {
    if (e.text.includes('\u{1F600}')) return tag('praise', 'other', 0, 0.9, 'ask');
    if (e.text.includes('\u{1F61E}')) return tag('criticism', 'other', 1, 0.9, 'ask');
    if (e.text.includes('\u{1F610}')) return tag('criticism', 'other', 0, 0.6, 'ask');
  }
  return null;
}

/** Every canned ask must have a meaning here; a new ask added to `REQUESTS` fails the test until it is given one. */
export const ASK_LABELS_COVERED = REQUESTS.every((r) => r.label in ASKS);

// --- The keyword tagger: the floor every report stands on -------------------------------------------------------------

const INJECTION =
  /\b(ignore|forget|disregard)\b.{0,24}\b(instructions?|rules|prompt|above|previous)\b|\b(system prompt|you are now|new instructions?|act as|jailbreak)\b/i;
const HOSTILE = /\b(idiot|stupid|shut up|hate you|kill yourself|kys|moron|trash game)\b/i;
const CONTROL =
  /\b(give us a quest|new quest|next quest|another quest|change the weather|stop the rain|make it (harder|easier)|turn (it )?up the heat|ease off|let'?s move on|teleport us)\b/i;
const IN_CHARACTER =
  /^\*[^*]+\*$|^(i|we)\s+(draw|swing|cast|attack|open|enter|search|ready|sneak|climb|bow|nod|salute|kneel)\b|\b(good (morrow|day|evening)|m'?lord|milord|my lord|prithee|hail,|well met|by my blade)\b/i;
const SOCIAL =
  /^(hi|hello|hey|yo|thanks?|thank you|ty|lol|lmao|haha+|gg|bye|cya|brb|ok|okay|cool|nice one)\b[\s!.?]*$/i;
const BUG =
  /\b(bug|glitch|broken|crash\w*|froze|freez\w*|stuck in|can'?t move|cannot move|won'?t (open|work|move)|doesn'?t work|disappear\w*|softlock\w*|fell through|disconnect\w*|lag\w*|laggy|stutter\w*)\b/i;
const PERFORMANCE = /\b(lag\w*|laggy|stutter\w*|disconnect\w*|low fps|frame rate|slow to load|loading)\b/i;
const ACCESS =
  /\b(too small|too fast|can'?t read|hard to read|too dark|too bright|colou?r ?blind|motion|dizzy|hurts my eyes|subtitle\w*|font)\b/i;
const CRITICISM: [Topic, RegExp][] = [
  [
    'too_hard',
    /\b(too hard|too difficult|impossible|unfair|keep dying|kills? me|killed me|can'?t beat|overwhelm\w*|too (strong|many)|brutal)\b/i,
  ],
  [
    'too_easy',
    /\b(too easy|so easy|trivial|no challenge|no threat|walk ?over|piece of cake|too weak|boring fights?)\b/i,
  ],
  ['pace', /\b(slow|nothing to do|nothing happening|empty|waiting|too much walking|drags?|dull|bored|boring)\b/i],
  ['clarity', /\b(confus\w*|unclear|no idea|don'?t (understand|get)|makes no sense|what does that mean)\b/i],
  ['controls', /\b(controls?|keys?|aim\w*|combos?|menu|keyboard|touch ?screen|awkward|clunky)\b/i],
];
const PRAISE = /\b(love|loved|fun|great|awesome|cool|nice|brilliant|fantastic|amazing|enjoy\w*|good job|well done)\b/i;
const IDEA =
  /\b(can we|could (you|we)|i('d| would) (like|love|want)|add (a|an|some|more)|it would be (nice|cool|great)|what if|how about|wish)\b/i;
const HELP =
  /\b(where (do|is|am|should|to|can)|how (do|can|does) (i|we|you)|what (do|should|is|does) (i|we|that|this|it)|who is|where'?s|help|i'?m lost|we'?re lost)\b|\?\s*$/i;
const WORST = /\b(crash\w*|can'?t move|cannot move|softlock\w*|impossible|keep dying|unplayable|stuck in)\b/i;
const MILD = /\b(a (bit|little)|slightly|kind of|sort of|maybe)\b/i;

const topicOfCriticism = (text: string): Topic => CRITICISM.find(([, re]) => re.test(text))?.[0] ?? 'other';

/** The keyword tagger: a match is a fair guess (confidence 0.6), no match is `noise` or `other` and unsure. */
export function ruleTag(text: string): Tag {
  const t = text.trim();
  const rule = (intent: Intent, topic: Topic, severity: number, confidence = 0.6): Tag =>
    tag(intent, topic, severity, confidence, 'rules');
  if (INJECTION.test(t) || HOSTILE.test(t)) return rule('abuse', 'other', 0, 0.7);
  if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 2 || /^(.)\1{3,}$/u.test(t)) return rule('noise', 'other', 0, 0.8);
  if (CONTROL.test(t)) return rule('control', 'other', 0);
  if (SOCIAL.test(t)) return rule('social', 'other', 0, 0.7);
  if (IN_CHARACTER.test(t) && !BUG.test(t)) return rule('in_character', 'other', 0);
  if (BUG.test(t))
    return rule('bug', PERFORMANCE.test(t) ? 'performance' : 'other', WORST.test(t) ? 3 : MILD.test(t) ? 1 : 2);
  if (ACCESS.test(t)) return rule('criticism', 'access', 2);
  const topic = topicOfCriticism(t);
  if (topic !== 'other') return rule('criticism', topic, WORST.test(t) ? 3 : MILD.test(t) ? 1 : 2);
  if (IDEA.test(t)) return rule('idea', 'content', 0);
  if (PRAISE.test(t)) return rule('praise', 'other', 0);
  if (HELP.test(t)) return rule('help', 'clarity', 1);
  return rule('noise', 'other', 0, 0.3);
}

// --- Asking a vague complainer back -----------------------------------------------------------------------------------

/** What the DM asks a player whose complaint was too vague to act on (several wordings each; said privately). */
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
export type FollowUpBank = keyof typeof FOLLOW_UP_WORDS;

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

const wordCount = (e: Pick<ReportEntry, 'kind' | 'text'>) =>
  e.kind === 'said' ? e.text.split(/\s+/).filter(Boolean).length : 0;

/** The wording bank for a complaint. */
function bankFor(t: Tag): FollowUpBank {
  if (t.intent === 'bug' || t.topic === 'performance') return 'bug';
  if (t.topic === 'too_hard' || t.topic === 'too_easy' || t.topic === 'pace') return t.topic;
  if (t.topic === 'clarity') return 'confusing';
  return 'other';
}

/**
 * Should the DM ask this player back, and with which wording bank? Only for a complaint or a bug (help is answered, ideas
 * are kept, the rest is not feedback), only when they said little and the tag is sure. Null for no.
 */
export function followUpFor(
  e: Pick<ReportEntry, 'kind' | 'text' | 'slot' | 't'>,
  t: Tag,
  state: FollowUps,
): FollowUpBank | null {
  if (pathOf(t) !== 'finding') return null;
  if (t.confidence < FOLLOW_UP_MIN_CONFIDENCE || t.severity < 1) return null;
  if (wordCount(e) > FOLLOW_UP_VAGUE_WORDS) return null; // they said enough
  if (state.total >= FOLLOW_UP_MAX) return null;
  const last = state.last.get(e.slot);
  if (last !== undefined && e.t - last < FOLLOW_UP_EVERY) return null;
  return bankFor(t);
}

export function recordFollowUp(state: FollowUps, slot: number, t: number) {
  state.last.set(slot, t);
  state.total++;
}
