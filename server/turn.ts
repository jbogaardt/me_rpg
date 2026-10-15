// What the DM bot does next, one step per tick (pure, tested). The order is the job's: keep a game open for friends to
// join, begin when told (or once enough are in), stay with the party (a DM quest is written from the land the DM stands
// in), answer the card up, then whatever waits in the inbox, and give the party a quest when nothing is asked of them.

import type { Card, Table } from './router';

/** How things stand on the page (its `DmBotState`). */
export interface PageState extends Table {
  role: string;
  code: string | null;
  lobbyOpen: boolean;
  dm: boolean;
  waiting: number;
  card: Card | null;
}

/** When the bot last did each slow thing (ms, any one clock). */
export interface Clock {
  now: number;
  lastHost: number;
  lastFollow: number;
  lastQuest: number;
  /** Friends connected for at least `SETTLE_MS`. */
  settled: number;
}

export type Step =
  | { kind: 'host' }
  | { kind: 'start' }
  | { kind: 'follow'; slot: number }
  | { kind: 'card' }
  | { kind: 'inbox' }
  | { kind: 'quest' }
  | { kind: 'idle' };

/** Between tries at opening a game (the relay may be down). */
export const HOST_RETRY_MS = 30_000;
/** Between trips to the party (a trip takes a moment, and a friend may be walking through a door). */
export const FOLLOW_MS = 10_000;
/**
 * How long a friend must stay before they count toward beginning the game. A friend whose page plays another world
 * connects, is told the host's world and comes back from a reload (the session's grace is 6 s): beginning in between
 * would close the code on them.
 */
export const SETTLE_MS = 10_000;
/** Quiet time before the bot offers the party a quest of its own accord. */
export const QUEST_GAP_MS = 45_000;

/** `startAt`: begin the game by itself once this many friends are in (0: only when told). */
export function nextStep(s: PageState, c: Clock, startAt = 0): Step {
  if (!s.code && !s.lobbyOpen && !s.friends.length)
    return c.now - c.lastHost >= HOST_RETRY_MS ? { kind: 'host' } : idle;
  if (!s.dm || !s.friends.length) return idle;
  if (startAt > 0 && s.lobbyOpen && c.settled >= startAt) return { kind: 'start' };
  const first = s.friends[0];
  if (first && !s.friends.some((f) => f.near) && c.now - c.lastFollow >= FOLLOW_MS)
    return { kind: 'follow', slot: first.slot };
  if (s.card) return { kind: 'card' };
  if (s.waiting > 0) return { kind: 'inbox' };
  if (!s.lobbyOpen && !s.questing && c.now - c.lastQuest >= QUEST_GAP_MS) return { kind: 'quest' };
  return idle;
}

const idle: Step = { kind: 'idle' };
