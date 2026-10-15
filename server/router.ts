// The DM bot's decisions (Pixi-free, Node-free, tested). Everything the Dungeon Master is asked arrives as a card (the
// director's nudges, a friend's request, a friend's own words), and every answer is one of the card's options, maybe a
// road of the live story, maybe a reply. Two tiers decide:
//
// 1. A fast router (the Jev API, jev.ts; a mock without a key) answers one `choice` question over the card's options, the story's roads (for
//    a friend's words) and `NONE`. Its pick counts only when it is sure (`CONFIDENCE`).
// 2. Otherwise a creative fallback (planned: Claude Haiku) improvises: an option and words for whoever asked. Its JSON is
//    checked here first (`readImprovised`), so a bad answer can only lose its pick, never reach the game.
//
// Neither may invent a world: an answer is only ever something the page offered, which the page checks again and sends
// to friends through the usual messages. Both services are interfaces with mocks (mocks.ts) until the real APIs are chosen.

/** How sure the router must be for its pick to be taken without asking the fallback. */
export const CONFIDENCE = 0.8;
/** The option that does nothing (send the card away). */
export const NONE = '@none';
/** Options that name a story road start with this (only offered for a friend's own words). */
export const ROAD = 'road:';
/** The most letters of a reply (the page trims the DM's words again). */
export const MAX_REPLY = 120;
/** What a friend hears when no service could answer them. */
export const HOLD_REPLY = 'The Dungeon Master ponders your words.';

export interface Option {
  id: string;
  label: string;
  on?: boolean;
}

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
  friends: { slot: number; area: string; hp: number; near: boolean }[];
  questing: boolean;
  story: { title: string; placed: string[]; total: number; options: Road[]; complete: boolean } | null;
}

/** What a question is asked about: the card, the player's words (if theirs) and the table, as named JSON fields. */
export interface QuestionState {
  card: { kind: string; title: string; note: string };
  /** The player's own words or ask, when the card is theirs. */
  playerWords: string | null;
  table: Table;
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
  const own = card.options.filter((o) => !o.id.startsWith('r:') && o.id !== NONE);
  const roads =
    card.kind === 'message' ? (table.story?.options ?? []).map((r) => ({ id: ROAD + r.cue, label: r.label })) : [];
  return [...own, ...roads, { id: NONE, label: 'Nothing: leave it be' }];
}

export function cardQuestion(card: Card, table: Table): ChoiceQuestion {
  const words = wordsOf(card);
  return {
    state: { card: { kind: card.kind, title: card.title, note: card.note }, playerWords: words, table },
    question: words
      ? 'You are the Dungeon Master of a co-op adventure. A player said `playerWords` (see `card` for how it reached ' +
        'you and `table` for the party and the story). Which of these is the most fitting response?'
      : 'You are the Dungeon Master of a co-op adventure. `card` says what is going on and `table` how the party and ' +
        'the story stand. Which of these is the best thing to do now?',
    options: optionsFor(card, table),
  };
}

/** The fallback's answer, if usable: a pick only when it is an option offered, a reply only when it is words. */
export function readImprovised(raw: unknown, options: Option[]): { pick: string | null; reply: string | null } | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const { pick, reply } = value as { pick?: unknown; reply?: unknown };
  const known = typeof pick === 'string' && pick !== NONE && options.some((o) => o.id === pick) ? pick : null;
  const words = typeof reply === 'string' && reply.trim() ? reply.trim().slice(0, MAX_REPLY) : null;
  if (!known && !words && pick !== NONE) return null;
  return { pick: known, reply: words };
}

/** A pick split into a card option or a road. */
function moveOf(source: Move['source'], id: string | null, reply: string | null, confidence: number | null): Move {
  const road = id?.startsWith(ROAD) ? id.slice(ROAD.length) : null;
  return { source, pick: road ? null : id, road, reply, confidence };
}

/** A short acknowledgement for a friend whose ask the router settled. */
function ack(option: Option | undefined): string {
  return option ? `So be it: ${option.label.replace(/^Reply: /, '').toLowerCase()}.` : 'Heard.';
}

/** Decide one card. Never throws: a failing service falls through to the next tier. */
export async function decideCard(
  card: Card,
  table: Table,
  services: { router: ChoiceRouter; fallback: CreativeFallback },
): Promise<Move> {
  const question = cardQuestion(card, table);
  const words = wordsOf(card);
  let confidence: number | null = null;
  try {
    const answer = await services.router.choose(question);
    confidence = answer.confidence;
    const option = question.options.find((o) => o.id === answer.choice);
    if (option && answer.confidence >= CONFIDENCE) {
      if (option.id !== NONE) return moveOf('router', option.id, words ? ack(option) : null, confidence);
      if (!words) return moveOf('router', null, null, confidence); // nothing to do and nobody to answer
    }
  } catch (err) {
    console.warn('router failed, improvising', err);
  }
  try {
    const raw = await services.fallback.improvise({ card, table, words, options: question.options });
    const made = readImprovised(raw, question.options);
    if (made) {
      // Words with no pick and nobody who asked ("Rise, friend" after choosing to do nothing) would say the opposite of what is done.
      const reply = !made.pick && !words ? null : (made.reply ?? (words ? HOLD_REPLY : null));
      return moveOf('fallback', made.pick, reply, confidence);
    }
  } catch (err) {
    console.warn('fallback failed', err);
  }
  return moveOf('silent', null, words ? HOLD_REPLY : null, confidence);
}
