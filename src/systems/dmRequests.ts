// Requests and suggestions for the Dungeon Master, held in an inbox instead of popping up (Pixi-free, tested; core engine,
// co-op). The director's own nudges ("it is going too easy") and a player's canned requests ("we're lost") are the same
// thing to the DM: a suggestion of a card they may open when they like, shown as a count on a button, never as a popup.

import type { Suggestion } from './dmDirector';

/** What a player may ask of the DM: each is a canned line (nothing typed) that maps to the card it brings up. */
export const REQUESTS: { label: string; kind: Suggestion }[] = [
  { label: 'We are lost', kind: 'lost' },
  { label: 'This is too hard', kind: 'struggle' },
  { label: 'This is too easy', kind: 'easy' },
  { label: 'Give us a quest', kind: 'next' },
  { label: 'Let us move on', kind: 'story' },
];

/** Seconds a player waits between requests, and a request waits unanswered before it is dropped. */
export const REQUEST_GAP = 20;
export const REQUEST_LIFE = 180;
export const SUGGESTION_LIFE = 90;
/** The most a DM's inbox holds. */
export const INBOX_MAX = 8;

/** What the DM sees about a suggestion (the director's own have no one asking). */
const NOTE: Record<Suggestion, string> = {
  revive: 'Someone has fallen',
  story: 'The story waits for a road',
  struggle: 'The party is struggling',
  easy: 'It is going too easy',
  twist: 'A good moment for a twist',
  lost: 'The party seems lost',
  done: 'A quest just ended',
  next: 'Nothing has been asked of the party',
  land: 'The party reached a new land',
};

export interface InboxItem {
  kind: Suggestion;
  /** Who asked (names), empty for the director. */
  from: string[];
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

  /** A suggestion arrives. One of a kind waits at a time (a second asker is added to the first). */
  add(kind: Suggestion, now: number, from = '') {
    const have = this.items.find((i) => i.kind === kind);
    if (have) {
      if (from && !have.from.includes(from)) have.from.push(from);
      return;
    }
    if (this.items.length >= INBOX_MAX) this.items.shift();
    this.items.push({ kind, from: from ? [from] : [], at: now });
  }

  /** The oldest suggestion, taken out. */
  take(): InboxItem | undefined {
    return this.items.shift();
  }

  /** Drop what has waited too long (a request keeps longer than the director's own nudge). */
  expire(now: number) {
    this.items = this.items.filter((i) => now - i.at < (i.from.length ? REQUEST_LIFE : SUGGESTION_LIFE));
  }

  /** The DM dealt with this kind by hand: it is no longer waiting. */
  drop(kind: Suggestion) {
    this.items = this.items.filter((i) => i.kind !== kind);
  }

  clear() {
    this.items = [];
  }
}

/** One line for an item: "Player 2: We are lost" or "It is going too easy". */
export function describe(item: InboxItem): string {
  if (!item.from.length) return NOTE[item.kind];
  const ask = REQUESTS.find((r) => r.kind === item.kind)?.label ?? NOTE[item.kind];
  return `${item.from.join(' & ')}: ${ask}`;
}
