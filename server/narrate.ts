// The DM speaking up on its own: not answering a card or a player, but remarking on what just happened at the table
// (the party walked into a new place, a quest ended, someone is hurt, the table went quiet). `beatFor` spots the moment
// (pure, tested); a `Narrator` words it. The mock narrator uses stock lines; a creative model slots in behind the same
// interface later, so only the wording changes.

import { SPEAK_AT, SPEAK_MIN_MS, moodOf, type Pulse } from './pulse';
import type { PageState } from './turn';

export type Beat =
  | { kind: 'arrive'; area: string }
  | { kind: 'done'; area: string }
  | { kind: 'hurt'; slot: number; area: string }
  | { kind: 'quiet'; area: string; mood?: 'calm' | 'tense' | 'dire' };

export interface Narrator {
  /** One short line, spoken as the Dungeon Master. */
  line(beat: Beat): Promise<string>;
  /** The saga now being told (its title and opening), so the DM's words carry its story. */
  setSaga?(saga: string): void;
}

/** What the narration remembers between ticks. */
export interface Memory {
  prev: PageState | null;
  /** When the DM last spoke (ms), by any means. */
  spoke: number;
}

/** Least time between two unprompted lines, so the DM never talks over the game. */
export const SPOKE_GAP_MS = 20_000;
/** Silence after which the DM says something to keep the table moving. */
export const QUIET_MS = 90_000;
/** A friend below this health (0 to 1) is worth a word, once per fall. */
export const HURT_BELOW = 0.25;

/** The moment worth a line now, if any. `m.prev` is the state last tick; the caller then sets `m.spoke` if it speaks. */
export function beatFor(s: PageState, m: Memory, now: number, pulse: Pulse | null = null): Beat | null {
  const prev = m.prev;
  if (!prev || !s.dm || !s.friends.length || s.lobbyOpen || s.card) return null;
  if (now - m.spoke < SPOKE_GAP_MS) return null;
  if (s.area !== prev.area) return { kind: 'arrive', area: s.area };
  // A saga tells its own story (its opening, each step, each person), so the DM adds nothing over it.
  if (prev.questing && !s.questing && !s.epic && !prev.epic) return { kind: 'done', area: s.area };
  const hurt = s.friends.find((f) => {
    const before = prev.friends.find((p) => p.slot === f.slot);
    return f.hp < HURT_BELOW && before !== undefined && before.hp >= HURT_BELOW;
  });
  if (hurt) return { kind: 'hurt', slot: hurt.slot, area: s.area };
  // With a table read, the reader says when a word would help; without one, a long silence does.
  const mood = moodOf(pulse);
  if (s.epic || s.questing) return null;
  if (pulse ? pulse.wantsWord >= SPEAK_AT && now - m.spoke >= SPEAK_MIN_MS : now - m.spoke >= QUIET_MS)
    return { kind: 'quiet', area: s.area, ...(mood ? { mood } : {}) };
  return null;
}

/**
 * Who the DM is. The words are a wise old wanderer's: warm, a little cryptic, never an announcement. The mock narrator
 * below speaks in this voice; a creative model is given this as its system prompt.
 */
export const PERSONA =
  'You are the Dungeon Master of a fantasy adventure: a warm, gripping storyteller who wants the players to care. ' +
  'Speak one or two short sentences, under 35 words. Be concrete: say what is at stake, who is in trouble and what to ' +
  'do next, and make the players want to act. Never a riddle, proverb or vague hint. Never mention game systems, ' +
  'numbers, menus or the word "player". Name no place, person or direction unless the message gives it: do not ' +
  'invent a bridge, village or road.';

const LINES: Record<Beat['kind'], ((b: Beat) => string)[]> = {
  arrive: [
    (b) =>
      `Ah, ${b.kind === 'arrive' ? b.area : 'this place'}. I had hoped we would come here, though not so soon. Walk softly.`,
    (b) =>
      `${b.kind === 'arrive' ? b.area : 'This place'} has a long memory, my friends. Be kind to it, and it may be kind to you.`,
    (b) =>
      `Mark this place well: ${b.kind === 'arrive' ? b.area : 'it'}. Old roads meet here, and old troubles with them.`,
  ],
  done: [
    () => 'Well done, though do not think the road is finished with you. It never is.',
    () => 'A small deed, you may say. But great doors turn on small hinges.',
  ],
  hurt: [
    () => 'Courage is no armour, friends. One of you has paid dearly. Look to each other.',
    () => 'Hold! There is wisdom in a step back, and no shame in it.',
  ],
  quiet: [
    (b) =>
      `Hm. ${b.kind === 'quiet' ? b.area : 'This place'} is quiet. Too quiet, I think. Quiet is often the breath before the tale turns.`,
    () => 'Take your time, if you must. But the world does not wait as patiently as I.',
  ],
};

/** Stock lines, rotating so the same one does not come twice running. */
export class MockNarrator implements Narrator {
  private n = 0;
  line(beat: Beat): Promise<string> {
    const lines = LINES[beat.kind];
    const pick = lines[this.n++ % lines.length];
    return Promise.resolve(pick ? pick(beat) : '');
  }
}
