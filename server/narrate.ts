// The DM speaking up on its own: not answering a card or a player, but remarking on what just happened at the table
// (the party walked into a new place, a quest ended, someone is hurt, the table went quiet). `beatFor` spots the moment
// (pure, tested); a `Narrator` words it. The mock narrator uses stock lines; a creative model slots in behind the same
// interface later, so only the wording changes.

import type { PageState } from './turn';

export type Beat =
  | { kind: 'arrive'; area: string }
  | { kind: 'done'; area: string }
  | { kind: 'hurt'; slot: number; area: string }
  | { kind: 'quiet'; area: string };

export interface Narrator {
  /** One short line, spoken as the Dungeon Master. */
  line(beat: Beat): Promise<string>;
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
export function beatFor(s: PageState, m: Memory, now: number): Beat | null {
  const prev = m.prev;
  if (!prev || !s.dm || !s.friends.length || s.lobbyOpen || s.card) return null;
  if (now - m.spoke < SPOKE_GAP_MS) return null;
  if (s.area !== prev.area) return { kind: 'arrive', area: s.area };
  if (prev.questing && !s.questing) return { kind: 'done', area: s.area };
  const hurt = s.friends.find((f) => {
    const before = prev.friends.find((p) => p.slot === f.slot);
    return f.hp < HURT_BELOW && before !== undefined && before.hp >= HURT_BELOW;
  });
  if (hurt) return { kind: 'hurt', slot: hurt.slot, area: s.area };
  if (now - m.spoke >= QUIET_MS) return { kind: 'quiet', area: s.area };
  return null;
}

const LINES: Record<Beat['kind'], ((b: Beat) => string)[]> = {
  arrive: [
    (b) => `${b.kind === 'arrive' ? b.area : 'This place'} opens before you. Stay alert.`,
    (b) => `You step into ${b.kind === 'arrive' ? b.area : 'new ground'}. Something here is watching.`,
    (b) => `The air shifts as you reach ${b.kind === 'arrive' ? b.area : 'a new place'}.`,
  ],
  done: [() => 'Well done. The road ahead is yours to choose.', () => 'That deed is done, and word of it will travel.'],
  hurt: [
    () => 'One of you is badly hurt. Fall back, or fight on at your peril.',
    () => 'Blood on the ground. The fight turns grim.',
  ],
  quiet: [
    (b) => `All is still in ${b.kind === 'quiet' ? b.area : 'this place'}, too still. Something stirs in the distance.`,
    () => 'Time passes. Will you press on, or rest while you can?',
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
