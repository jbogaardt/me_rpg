// The DM bot's decisions (Pixi-free, Node-free, tested). Everything the Dungeon Master is asked arrives as a card (the
// director's nudges, a friend's request, a friend's own words), and every answer is one of the card's options, maybe a
// road of the live story, maybe a reply. Two tiers decide:
//
// 1. A fast router (the Jev API, jev.ts; a mock without a key) answers one `choice` question over the card's options, the story's roads (for
//    a friend's words) and `NONE`. Its pick counts only when it is sure (`CONFIDENCE`).
// 2. Otherwise a creative fallback (planned: Claude Haiku) improvises: an option and words for whoever asked. Its JSON is
//    checked here first (`readImprovised`), so a bad answer can only lose its pick, never reach the game.
//
// A player's typed words are different: they ALWAYS go to the creative writer and its reply is always sent, so a player
// is never left unanswered (Jev only does the passive work: a card's options, and events with no player words). A reply
// that repeats a recent one, uses the banned phrasing or is a low-confidence guess is asked for again once, then replaced
// by a plain answer (the party's task) rather than sent.
//
// Neither may invent a world: an answer is only ever something the page offered, which the page checks again and sends
// to friends through the usual messages. Both services are interfaces with mocks (mocks.ts) until the real APIs are chosen.

import { Phrasebook } from '../src/systems/phrases';
/** How sure the router must be for its pick to be taken without asking the fallback, when a player's own words are the question. */
export const CONFIDENCE = 0.8;
/**
 * The same for a director's card. These have two or three options that each mean something definite, so the router's
 * top pick is the answer unless it is close to a coin toss: the creative fallback is kept for what needs words.
 */
export const CONFIDENCE_CARD = 0.55;
/** The option that does nothing (send the card away). */
export const NONE = '@none';
/** Options that name a story road start with this (only offered for a friend's own words). */
export const ROAD = 'road:';
/** The most letters of a reply (the page trims the DM's words again). */
export const MAX_REPLY = 120;
/** What a friend hears when no service could answer them (several wordings, so it does not sound like a machine). */
export const HOLD_REPLIES = [
  'The Dungeon Master ponders your words.',
  'Hm. Let me think on that a moment.',
  'I heard you. Give an old man a moment.',
  'A fair question. I am turning it over.',
  'Patience, friend. The answer is coming.',
];
const phrases = new Phrasebook();
/** One of the holding replies, not the one said last. */
export const holdReply = (): string => phrases.pick('hold', HOLD_REPLIES);

export interface Option {
  id: string;
  label: string;
  on?: boolean;
  /** When this is the right choice, in plain words for the router (see `HINTS`). */
  hint?: string;
}

/**
 * What each choice of a director's card means, for the router: when it is right. Keyed `card kind/option id` (an option
 * id's part before a `:`). A bare label ("Stay the course") says little to a model; this is what lets it decide.
 */
export const HINTS: Record<string, string> = {
  'words/ease': 'the player says the fight is too hard, there are too many enemies, or they are being killed',
  'words/heat': 'the player says it is too easy or boring and wants more danger',
  'words/hint': 'the player says they are lost, do not know where to go or what to do next',
  'easy/heat': 'the party is healthy and winning easily, so the world should push back harder',
  'easy/stay': 'the party is having a good time or the story needs this calm; leave things as they are',
  'struggle/ease': 'the party is hurt or losing a fight, so the world should give them room to recover',
  'struggle/stay': 'the party is hurt but coping, or the danger is the point of the story; do not soften it',
  'lost/hint': 'the party has made no progress for a long time and does not know where to go',
  'lost/stay': 'the party is wandering but happy to explore; let them find the way themselves',
  'done/ease': 'the last task was hard-won, so the party should get a breather',
  'done/heat': 'the last task was easy, so raise the stakes',
  'done/stay': 'the pace of the last task was right',
  'revive/where': 'the party needs the fallen player back now, or the danger has passed: raise them where they fell',
  'revive/here': 'the fallen player should rejoin without a long walk: bring them to the Dungeon Master',
  'revive/leave': 'the fight is still dangerous or the defeat was fair: let them wake at the start',
  'twist/close': 'the story is quiet or halfway through and something should happen: foes close in',
  'twist/ease': 'the party has had a rough time: give them a breather',
};

/** A card waiting for the DM (the page's `DmBotCard`). */
export interface Card {
  kind: string;
  title: string;
  note: string;
  options: Option[];
}

/** One road the story may take next (the page's `StoryOption`). */
export interface Road {
  cue: string;
  label: string;
  theme: string;
  tags: string[];
}

/** How things stand (the page's `DmBotState`, as far as the decisions need it). */
export interface Table {
  area: string;
  friends: {
    slot: number;
    area: string;
    hp: number;
    near: boolean;
    toward?: { dx: number; dy: number; cells: number };
  }[];
  questing: boolean;
  /** The party's current task as their tracker says it, when there is one. */
  task?: string | null;
  story: { title: string; placed: string[]; total: number; options: Road[]; complete: boolean } | null;
  /** The epic being told, as the page says it (title, current chapter of total), when one is running. */
  epicNow?: { title: string; step: number; total: number } | null;
}

/** What a question is asked about: the card, the player's words (if theirs) and the table, as named JSON fields. */
export interface QuestionState {
  card: { kind: string; title: string; note: string };
  /** How the party is in health, 0 to 1 (empty party: 1). */
  party: { average: number; lowest: number; players: number };
  /** The player's own words or ask, when the card is theirs. */
  playerWords: string | null;
  /** The table as the router needs it: where, how many, the story. No slots, offsets or ids to wade through. */
  table: { area: string; questActive: boolean; story: Table['story']; epic?: Table['epicNow'] };
}

/** A `choice` question: the state, the question, and the ids it may answer. */
export interface ChoiceQuestion {
  state: QuestionState;
  question: string;
  options: Option[];
}

/** The router's answer: its pick and how sure it is (the top of its probability distribution). */
export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  distribution: Record<string, number>;
}

export interface ChoiceRouter {
  choose(question: ChoiceQuestion): Promise<ChoiceAnswer>;
}

/** What the fallback is given. It returns raw JSON `{ pick?, reply? }`, read with `readImprovised`. */
export interface ImproviseRequest {
  card: Card;
  table: Table;
  /** A friend's words or ask, when the card is theirs. */
  words: string | null;
  options: Option[];
  /** The last things the DM said, so the writer does not say them again. */
  recent?: string[];
  /** Why the last try was refused (a repeat, banned phrasing, a guess), when this is a second go. */
  refused?: string;
}

export interface CreativeFallback {
  improvise(request: ImproviseRequest): Promise<unknown>;
}

/** What the bot does with a card: tap an option (or take a road), say something to whoever asked, or nothing. */
export interface Move {
  source: 'router' | 'fallback' | 'silent';
  /** A card option's id (never `NONE`). */
  pick: string | null;
  /** A story road's cue. */
  road: string | null;
  reply: string | null;
  confidence: number | null;
}

/** The friend's words on a card of theirs (a message card's quote, or "Player 2 asked: we are lost"), else null. */
export function wordsOf(card: Card): string | null {
  if (card.kind === 'message') return card.note.replace(/^[“"]|[”"]$/g, '').trim() || null;
  const asked = /asked: (.*?)\.?$/.exec(card.note);
  return asked?.[1]?.trim() || null;
}

/** What may be answered: the card's own options (not its canned replies: the bot writes its own), roads, and none. */
export function optionsFor(card: Card, table: Table): Option[] {
  // One epic at a time: while one runs, "give them a quest" is not offered (the page refuses a second one as well).
  const running = !!table.epicNow || table.questing;
  const own = card.options
    .filter((o) => !o.id.startsWith('r:') && o.id !== NONE && !(running && o.id === '@quest'))
    .map((o) => {
      const hint = HINTS[`${card.kind}/${o.id.split(':')[0]}`];
      return hint ? { ...o, hint } : o;
    });
  const roads =
    card.kind === 'message' ? (table.story?.options ?? []).map((r) => ({ id: ROAD + r.cue, label: r.label })) : [];
  // A director's card already has its own way to do nothing ("stay the course"), so a third "nothing" would only split the router's vote.
  // A player's own words may ask for what the DM's bar can do, so those are offered too.
  const steer: Option[] = [
    { id: 'ease', label: 'Ease off: fewer or weaker enemies', hint: HINTS['words/ease']! },
    { id: 'heat', label: 'Turn up the danger', hint: HINTS['words/heat']! },
    { id: 'hint', label: 'Show them the way (their map, then an arrow)', hint: HINTS['words/hint']! },
  ];
  const have = new Set(own.map((o) => o.id));
  return card.kind === 'message' || wordsOf(card)
    ? [...own, ...steer.filter((o) => !have.has(o.id)), ...roads, { id: NONE, label: 'Nothing: leave it be' }]
    : own;
}

/** The party's health in two numbers, so the router need not add up `table.friends`. */
export function partyHealth(table: Table): { average: number; lowest: number; players: number } {
  const hp = table.friends.map((f) => f.hp);
  if (!hp.length) return { average: 1, lowest: 1, players: 0 };
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    average: round(hp.reduce((a, b) => a + b, 0) / hp.length),
    lowest: round(Math.min(...hp)),
    players: hp.length,
  };
}

export function cardQuestion(card: Card, table: Table): ChoiceQuestion {
  const words = wordsOf(card);
  return {
    state: {
      card: { kind: card.kind, title: card.title, note: card.note },
      party: partyHealth(table),
      playerWords: words,
      table: {
        area: table.area,
        questActive: table.questing,
        story: table.story,
        ...(table.epicNow ? { epic: table.epicNow } : {}),
      },
    },
    question: words
      ? 'You are the Dungeon Master of a co-op adventure. A player said `playerWords` (see `card` for how it reached ' +
        'you and `table` for the party and the story). Which of these is the most fitting response?'
      : 'You are the Dungeon Master of a co-op adventure. `card` says what is going on and `table` how the party and ' +
        'the story stand. Which of these is the best thing to do now?',
    options: optionsFor(card, table),
  };
}

/** The fallback's answer, if usable: a pick only when it is an option offered, a reply only when it is words. */
export function readImprovised(
  raw: unknown,
  options: Option[],
): { pick: string | null; reply: string | null; sure?: number } | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const { pick, reply, sure } = value as { pick?: unknown; reply?: unknown; sure?: unknown };
  const known = typeof pick === 'string' && pick !== NONE && options.some((o) => o.id === pick) ? pick : null;
  const words = typeof reply === 'string' && reply.trim() ? reply.trim().slice(0, MAX_REPLY) : null;
  if (!known && !words && pick !== NONE) return null;
  return { pick: known, reply: words, ...(typeof sure === 'number' && sure >= 0 && sure <= 1 ? { sure } : {}) };
}

/** Phrasing the team does not want from the DM ("Follow the way"). */
export const BANNED = /\bfollow (the|this) (way|path|road)\b/i;
/** Below this the writer's own confidence makes its reply a guess, not an answer. */
export const SURE_ENOUGH = 0.5;
/** How alike two replies may be (shared words over the shorter one) before the newer is a repeat. */
export const REPEAT_AT = 0.6;
const wordsIn = (text: string): Set<string> => new Set(text.toLowerCase().match(/[a-z']{3,}/g) ?? []);

/** Is this reply (nearly) one the DM has already said lately? */
export function isRepeat(reply: string, recent: string[]): boolean {
  const mine = wordsIn(reply);
  if (!mine.size) return false;
  return recent.some((old) => {
    const theirs = wordsIn(old);
    if (!theirs.size) return false;
    let shared = 0;
    for (const w of mine) if (theirs.has(w)) shared++;
    return shared / Math.min(mine.size, theirs.size) >= REPEAT_AT;
  });
}

/** Why a writer's answer may not be sent as it is, or null when it can be. */
export function refusal(made: { reply: string | null; sure?: number }, recent: string[]): string | null {
  if (!made.reply) return 'you said nothing: answer the player in words';
  if (BANNED.test(made.reply)) return 'never say "follow the way" or "follow the path": name the place and what to do';
  if (isRepeat(made.reply, recent))
    return 'that repeats something you already said: say something new, or answer more plainly';
  if (made.sure !== undefined && made.sure < SURE_ENOUGH)
    return 'you were unsure: answer plainly only what you know, or say what you need to know';
  return null;
}

/** A pick split into a card option or a road. */
function moveOf(source: Move['source'], id: string | null, reply: string | null, confidence: number | null): Move {
  const road = id?.startsWith(ROAD) ? id.slice(ROAD.length) : null;
  return { source, pick: road ? null : id, road, reply, confidence };
}

/** What a player hears when the writer could only guess or repeat itself: the party's task, plainly, else a holding word. */
function plainReply(table: Table): string {
  if (table.epicNow) {
    const { title, step, total } = table.epicNow;
    return `Your saga is “${title}”, chapter ${step} of ${total}.${table.task ? ` ${table.task}` : ''}`;
  }
  return table.task ? `Your task now: ${table.task}` : holdReply();
}

/**
 * A player's typed words: always the writer, always a reply. Jev does not vote on these. The writer's answer is asked for
 * again once if it repeats, guesses or uses banned phrasing, then a plain reply is sent instead.
 */
async function answerWords(
  card: Card,
  table: Table,
  words: string,
  options: Option[],
  fallback: CreativeFallback,
  recent: string[],
): Promise<Move> {
  let refused: string | undefined;
  let made: ReturnType<typeof readImprovised> = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await fallback.improvise({ card, table, words, options, recent, ...(refused ? { refused } : {}) });
      made = readImprovised(raw, options);
    } catch (err) {
      console.warn('fallback failed', err);
      made = null;
      break;
    }
    refused = made ? (refusal(made, recent) ?? undefined) : 'answer in the JSON form asked for';
    if (!refused) break;
  }
  if (!made) return moveOf('silent', null, holdReply(), null);
  const confidence = made.sure ?? null;
  return moveOf('fallback', made.pick, refused ? plainReply(table) : made.reply, confidence);
}

/**
 * Decide one card. Never throws: a failing service falls through to the next tier. A player's typed words always go to the
 * writer and always get a reply (`answerWords`); a card with no options skips the router (it has nothing to choose).
 */
export async function decideCard(
  card: Card,
  table: Table,
  services: { router: ChoiceRouter; fallback: CreativeFallback },
  recent: string[] = [],
): Promise<Move> {
  const question = cardQuestion(card, table);
  const words = wordsOf(card);
  if (words) return answerWords(card, table, words, question.options, services.fallback, recent);
  if (!question.options.length) return moveOf('silent', null, null, null); // nothing to choose and nobody to answer
  let confidence: number | null = null;
  try {
    const answer = await services.router.choose(question);
    confidence = answer.confidence;
    const option = question.options.find((o) => o.id === answer.choice);
    if (option && answer.confidence >= CONFIDENCE_CARD)
      return moveOf('router', option.id === NONE ? null : option.id, null, confidence);
  } catch (err) {
    console.warn('router failed, improvising', err);
  }
  try {
    const raw = await services.fallback.improvise({ card, table, words, options: question.options, recent });
    const made = readImprovised(raw, question.options);
    if (made) return moveOf('fallback', made.pick, null, confidence); // a director's card is acted on, not announced
  } catch (err) {
    console.warn('fallback failed', err);
  }
  return moveOf('silent', null, null, confidence);
}
