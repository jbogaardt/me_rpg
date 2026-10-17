// What the DM bot does next, one step per tick (pure, tested). The order is the job's: keep a game open for friends to
// join, begin when told (or once enough are in), stay with the party (a DM quest is written from the land the DM stands
// in), answer the card up, then whatever waits in the inbox, and give the party a quest when nothing is asked of them.

import { QUEST_AT, QUEST_MIN_MS, type Pulse } from './pulse';
import type { Card, Table } from './router';

/** How things stand on the page (its `DmBotState`). */
export interface PageState extends Table {
  /** Where the DM stands (its zone's own name and feet in cells), and where each friend does: only for the log of a trip. */
  zone?: string;
  at?: { col: number; row: number };
  friends: (Table['friends'][number] & {
    zone?: string;
    at?: { col: number; row: number };
    cells?: number | null;
  })[];
  role: string;
  code: string | null;
  lobbyOpen: boolean;
  dm: boolean;
  waiting: number;
  /** An epic is being told (between its steps `questing` is false). */
  epic: boolean;
  /** Sagas completed so far (`DmEpics.completed`); the arc's ending beat reads it. */
  epicsDone?: number;
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
  /** When the last saga (or quest of its own) ended: the party is left to wander for `BREATHER_MS` after. */
  lastEnded?: number;
  /** The latest table read, when one is fresh (see pulse.ts); without it timers decide. */
  pulse?: Pulse | null;
}

export type Step =
  | { kind: 'host' }
  | { kind: 'start' }
  | { kind: 'follow'; slot: number }
  | { kind: 'card' }
  | { kind: 'inbox' }
  | { kind: 'quest' }
  | { kind: 'stroll'; dx: number; dy: number }
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
/**
 * After a saga ends the party is given time to wander, go to town, shop and talk before the next is offered, whatever the
 * table read says (a player who wants one sooner can ask). An adventure breathes; a quest queue does not.
 */
export const BREATHER_MS = 150_000;

/** `startAt`: begin the game by itself once this many friends are in (0: only when told). */
export function nextStep(s: PageState, c: Clock, startAt = 0): Step {
  if (!s.code && !s.lobbyOpen && !s.friends.length)
    return c.now - c.lastHost >= HOST_RETRY_MS ? { kind: 'host' } : idle;
  if (!s.dm || !s.friends.length) return idle;
  if (startAt > 0 && s.lobbyOpen && c.settled >= startAt) return { kind: 'start' };
  const first = s.friends[0];
  // He walks to a party in his own zone (the stroll below); he goes to one in another zone, or very far off, in a blink.
  const walkable = s.friends.some((f) => f.toward && f.toward.cells <= WALK_MAX);
  if (first && !s.friends.some((f) => f.near) && !walkable && c.now - c.lastFollow >= FOLLOW_MS)
    return { kind: 'follow', slot: first.slot };
  if (s.card) return { kind: 'card' };
  if (s.waiting > 0) return { kind: 'inbox' };
  const resting = c.lastEnded !== undefined && c.now - c.lastEnded < BREATHER_MS;
  if (!s.lobbyOpen && !s.questing && !s.epic && !resting) {
    // With a table read, the reader says when the party needs a quest; without one, a long wait does.
    const ready = c.pulse
      ? c.pulse.needsQuest >= QUEST_AT && c.now - c.lastQuest >= QUEST_MIN_MS
      : c.now - c.lastQuest >= QUEST_GAP_MS;
    if (ready) return { kind: 'quest' };
  }
  return s.lobbyOpen ? idle : stroll(s, c.now);
}

/** Past this many cells from the nearest friend the DM walks to them; nearer, he ambles about them. */
/** Farther than this many cells away, the DM goes to the party instead of walking. */
export const WALK_MAX = 40;
export const STROLL_FAR = 7;
/** How long (ms) the DM keeps one heading while ambling, and every third heading he stops and looks about. */
export const STROLL_MS = 3000;
const HEADINGS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

/** Which way (-1, 0 or 1) to step toward a gap of `cells`, ignoring a gap under a cell. */
const lean = (cells: number): number => (Math.abs(cells) < 1 ? 0 : Math.sign(cells));

/**
 * The Dungeon Master is a person in the world, not a statue: he drifts to the party when they are far (in the same
 * zone; a different one is the Go button's job) and otherwise wanders slowly around them, pausing now and then.
 */
function stroll(s: PageState, now: number): Step {
  const near = s.friends.flatMap((f) => (f.toward ? [f.toward] : [])).sort((a, b) => a.cells - b.cells)[0];
  if (!near) return idle;
  if (near.cells > STROLL_FAR) return { kind: 'stroll', dx: lean(near.dx), dy: lean(near.dy) };
  const beat = Math.floor(now / STROLL_MS);
  if (beat % 3 === 0) return idle; // a pause
  const heading = HEADINGS[(beat * 5) % HEADINGS.length];
  return heading ? { kind: 'stroll', dx: heading[0], dy: heading[1] } : idle;
}

const idle: Step = { kind: 'idle' };

/** How long after setting the pressure the opposite card (struggling after turning up the heat, and back) is held. */
export const PRESSURE_HOLD_MS = 120_000;
/** The least time between two turns of the heat. */
export const HEAT_HOLD_MS = 300_000;

/** The pressure the DM last set: the id of the option picked (`heat` or `ease`) and when (ms, the bot's clock). */
export interface Pressure {
  id: 'heat' | 'ease';
  at: number;
}

/**
 * A pressure card that asks for the opposite of what was just set: the party's health swings with every fight, so
 * answering each wobble has the DM easing off and turning up the heat within seconds. It is sent away instead.
 */
export function heldCard(card: Card, last: Pressure | null, now: number): boolean {
  if (!last) return false;
  // More foes are a gift sparingly given: no second push within HEAT_HOLD_MS (an adventure, not a gauntlet).
  if (last.id === 'heat' && now - last.at < HEAT_HOLD_MS && card.options.some((o) => o.id === 'heat')) return true;
  if (now - last.at >= PRESSURE_HOLD_MS) return false;
  const opposite = last.id === 'heat' ? 'ease' : 'heat';
  return card.options.some((o) => o.id === opposite) && !card.options.some((o) => o.id === last.id);
}

/** One line saying why the bot goes to the party: where he stands, where each friend does and how far the bot reckoned. */
export function followLine(s: PageState, slot: number, name: (slot: number) => string): string {
  const at = (p?: { col: number; row: number }) => (p ? `${p.col},${p.row}` : '?');
  const friends = s.friends.map(
    (f) =>
      `${name(f.slot)} ${f.zone ?? f.area} ${at(f.at)} ${f.cells === undefined ? '?' : f.cells === null ? 'other zone' : `${f.cells.toFixed(1)} cells`}${f.near ? ' near' : ''}`,
  );
  return `going to ${name(slot)}: DM in ${s.zone ?? s.area} ${at(s.at)}; ${friends.join('; ')}`;
}
