import { REPLY_WORDS } from './dmVoice';
// Requests, suggestions and replies between the party and the Dungeon Master (Pixi-free, tested; core engine, co-op). The
// director's own nudges ("it is going too easy") and a player's asks ("we're lost", or a few words of their own) are the
// same thing to the DM: something waiting in an inbox, shown as a count on a button, never a popup. The DM answers back:
// a canned reply or their own words, sent to whoever asked and shown only to them.

import type { Suggestion } from './dmDirector';

/** What an inbox item can be: the director's suggestions, a card a player asks for by name, or a player's own words. */
export type InboxKind = Suggestion | 'sky' | 'epic' | 'message';

/** What a player may ask of the DM with one tap: each maps to the card it brings up for the DM. */
export const REQUESTS: { label: string; kind: InboxKind }[] = [
  { label: 'We are lost', kind: 'lost' },
  { label: 'This is too hard', kind: 'struggle' },
  { label: 'This is too easy', kind: 'easy' },
  { label: 'Give us a quest', kind: 'next' },
  { label: 'Give us an epic quest', kind: 'epic' },
  { label: 'Change the weather', kind: 'sky' },
  { label: 'Let us move on', kind: 'story' },
];

/** The code of "something I typed", after the canned ones. */
export const MESSAGE_CODE = REQUESTS.length;
/** The most letters a player may type to the DM. */
export const MAX_ASK = 120;

/** The DM's canned replies. */
export const REPLIES = REPLY_WORDS;

/** A player's words as they will be sent: trimmed, one line, no longer than `MAX_ASK`. */
export const cleanAsk = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_ASK).trim();

/** Seconds a request waits unanswered before it is dropped (a nudge of the director's, which goes stale, much sooner). */
export const REQUEST_LIFE = 180;
export const SUGGESTION_LIFE = 90;
/** The most a DM's inbox holds. */
export const INBOX_MAX = 8;

const NOTE: Record<InboxKind, string> = {
  revive: 'Someone has fallen',
  story: 'The story waits for a road',
  struggle: 'The party is struggling',
  easy: 'It is going too easy',
  twist: 'A good moment for a twist',
  lost: 'The party seems lost',
  done: 'A quest just ended',
  next: 'Nothing has been asked of the party',
  land: 'The party reached a new land',
  sky: 'How does the sky look?',
  epic: 'An epic quest could begin',
  message: 'A message',
};

export interface InboxItem {
  kind: InboxKind;
  /** Who asked (names), empty for the director. */
  from: string[];
  /** The seats of those who asked, to answer them. */
  slots: number[];
  /** What they wrote, for a message. */
  text?: string;
  /** When it arrived (seconds on the inbox's clock). */
  at: number;
}

export class Inbox {
  private items: InboxItem[] = [];

  get size(): number {
    return this.items.length;
  }

  /** What is waiting, oldest first. */
  get list(): readonly InboxItem[] {
    return this.items;
  }

  /**
   * Something arrives. One of a kind waits at a time (a second asker is added to the first); every message waits on its own
   * (the same words from the same seat twice are one).
   */
  add(kind: InboxKind, now: number, from = '', slot?: number, text?: string) {
    const have = this.items.find((i) =>
      kind === 'message' ? i.kind === 'message' && i.text === text && i.slots.includes(slot ?? -1) : i.kind === kind,
    );
    if (have) {
      if (from && !have.from.includes(from)) have.from.push(from);
      if (slot !== undefined && !have.slots.includes(slot)) have.slots.push(slot);
      return;
    }
    if (this.items.length >= INBOX_MAX) this.items.shift();
    this.items.push({
      kind,
      from: from ? [from] : [],
      slots: slot === undefined ? [] : [slot],
      ...(text ? { text } : {}),
      at: now,
    });
  }

  /** The oldest item, taken out. */
  take(): InboxItem | undefined {
    return this.items.shift();
  }

  /** Drop what has waited too long (a request keeps longer than the director's own nudge). */
  expire(now: number) {
    this.items = this.items.filter((i) => now - i.at < (i.from.length ? REQUEST_LIFE : SUGGESTION_LIFE));
  }

  /** The DM dealt with this kind by hand: it is no longer waiting (messages are never dropped this way). */
  drop(kind: InboxKind) {
    this.items = this.items.filter((i) => i.kind !== kind || i.kind === 'message');
  }

  clear() {
    this.items = [];
  }
}

/** One line for an item: "Player 2: We are lost", "Player 2: “come help”" or "It is going too easy". */
export function describe(item: InboxItem): string {
  if (item.kind === 'message') return `${item.from.join(' & ')}: “${item.text ?? ''}”`;
  if (!item.from.length) return NOTE[item.kind];
  const ask = REQUESTS.find((r) => r.kind === item.kind)?.label ?? NOTE[item.kind];
  return `${item.from.join(' & ')}: ${ask}`;
}
