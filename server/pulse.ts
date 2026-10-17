// The table read: how the game stands, judged now and then by the fast model rather than by timers. One request puts
// several independent questions over the same small state (the fan-out pattern: they run in parallel, so asking more
// costs little time), and the bot's code decides what each answer is worth: when the DM speaks up unprompted
// (narrate.ts), and when the party is offered a quest (turn.ts). Without a reader (no key) the old timers decide.
// Pixi-free, Node-free, tested.

import type { PageState } from './turn';

/** What the reader is shown: named facts only, no ids, positions or judgments. Times are in seconds. */
export interface PulseState {
  area: string;
  party: { players: number; averageHealthPercent: number; lowestHealthPercent: number; fallen: number };
  /** `questActive`: a quest or an epic step is running now. */
  progress: { questActive: boolean; secondsSinceQuestOffered: number; secondsSinceDmSpoke: number };
}

/** The judgments, each 0 to 1. */
export interface Pulse {
  /** How hard pressed the party is (0 cruising, 1 overwhelmed). */
  pressure: number;
  /** The players seem to be at a loss or idle. */
  stalled: number;
  /** A short remark from the DM now would help rather than annoy. */
  wantsWord: number;
  /** Nothing is asked of the party and a new quest should be offered. */
  needsQuest: number;
  /** When it was read (ms). */
  at: number;
}

export interface TableReader {
  read(state: PulseState): Promise<Omit<Pulse, 'at'>>;
}

/** Between reads, and how old a read may be before the timers take over again. */
export const PULSE_MS = 8_000;
export const PULSE_STALE_MS = 3 * PULSE_MS;
/** How likely a yes must be to act on it. */
export const SPEAK_AT = 0.7;
export const QUEST_AT = 0.7;
/** The least time between two unprompted remarks / two quest offers even when the reader asks for more. */
export const SPEAK_MIN_MS = 30_000;
export const QUEST_MIN_MS = 20_000;

export function pulseState(s: PageState, spoke: number, lastQuest: number, now: number): PulseState {
  const hp = s.friends.map((f) => f.hp);
  const percent = (n: number) => Math.round(n * 100);
  const secs = (since: number) => Math.max(0, Math.round((now - since) / 1000));
  return {
    area: s.area,
    party: {
      players: hp.length,
      averageHealthPercent: hp.length ? percent(hp.reduce((a, b) => a + b, 0) / hp.length) : 100,
      lowestHealthPercent: hp.length ? percent(Math.min(...hp)) : 100,
      fallen: hp.filter((h) => h <= 0).length,
    },
    progress: {
      questActive: s.questing || s.epic,
      secondsSinceQuestOffered: secs(lastQuest),
      secondsSinceDmSpoke: secs(spoke),
    },
  };
}

/** A read worth acting on: not older than `PULSE_STALE_MS`. */
export const fresh = (p: Pulse | null, now: number): Pulse | null => (p && now - p.at <= PULSE_STALE_MS ? p : null);

/** The tone for the DM's words, from the pressure. */
export const moodOf = (p: Pulse | null): 'calm' | 'tense' | 'dire' | null =>
  !p ? null : p.pressure >= 0.7 ? 'dire' : p.pressure >= 0.35 ? 'tense' : 'calm';

/** Attempts at one read, and the wait before the second (doubled for each after). */
export const READ_ATTEMPTS = 3;
export const READ_BACKOFF_MS = 500;

/**
 * A reader that tries again when the request fails (a network "fetch failed" is usually brief): up to `attempts` tries
 * with doubling waits, then it throws an error naming the step, which the host logs before the timers take over.
 */
export class RetryingReader implements TableReader {
  constructor(
    private inner: TableReader,
    private attempts = READ_ATTEMPTS,
    private backoffMs = READ_BACKOFF_MS,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private warn: (line: string) => void = (line) => console.warn(line),
  ) {}

  async read(state: PulseState): Promise<Omit<Pulse, 'at'>> {
    let last: unknown;
    for (let i = 1; i <= this.attempts; i++) {
      try {
        return await this.inner.read(state);
      } catch (err) {
        last = err;
        if (i < this.attempts) {
          const why = err instanceof Error ? err.message : String(err);
          this.warn(`table read (Jev) attempt ${i}/${this.attempts} failed: ${why}; retrying`);
          await this.sleep(this.backoffMs * 2 ** (i - 1));
        }
      }
    }
    const why = last instanceof Error ? last.message : String(last);
    throw new Error(`step "table read (Jev)" failed after ${this.attempts} attempts: ${why}; the timers decide`);
  }
}
