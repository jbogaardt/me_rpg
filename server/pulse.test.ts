import { describe, expect, it } from 'vitest';
import { beatFor } from './narrate';
import { PULSE_STALE_MS, fresh, moodOf, pulseState, type Pulse } from './pulse';
import { nextStep, type Clock, type PageState } from './turn';

const friend = (slot: number, hp: number) => ({ slot, area: 'Greenwood', hp, near: true });
const state = (over: Partial<PageState> = {}): PageState => ({
  role: 'host',
  code: null,
  lobbyOpen: false,
  dm: true,
  waiting: 0,
  card: null,
  area: 'Greenwood',
  friends: [friend(1, 1), friend(2, 0.5)],
  questing: false,
  epic: false,
  story: null,
  ...over,
});
const pulse = (over: Partial<Pulse> = {}): Pulse => ({
  pressure: 0.1,
  stalled: 0,
  wantsWord: 0,
  needsQuest: 0,
  at: 1000,
  ...over,
});
const clock = (c: Partial<Clock> = {}): Clock => ({
  now: 100_000,
  lastHost: 0,
  lastFollow: 0,
  lastQuest: 0,
  settled: 0,
  ...c,
});

describe('the table read', () => {
  it('shows the reader named facts about health and timing', () => {
    expect(pulseState(state(), 40_000, 70_000, 100_000)).toEqual({
      area: 'Greenwood',
      party: { players: 2, averageHealthPercent: 75, lowestHealthPercent: 50, fallen: 0 },
      progress: { questActive: false, secondsSinceQuestOffered: 30, secondsSinceDmSpoke: 60 },
    });
  });

  it('is dropped when old, and gives the words a tone', () => {
    expect(fresh(pulse({ at: 0 }), PULSE_STALE_MS + 1)).toBeNull();
    expect(fresh(pulse({ at: 0 }), PULSE_STALE_MS)).not.toBeNull();
    expect([0.1, 0.5, 0.9].map((pressure) => moodOf(pulse({ pressure })))).toEqual(['calm', 'tense', 'dire']);
  });

  it('lets the reader say when the DM speaks, not the long silence', () => {
    const m = { prev: state(), spoke: 100_000 - 31_000 };
    expect(beatFor(state(), m, 100_000)).toBeNull(); // timers: 90 s of silence not yet
    expect(beatFor(state(), m, 100_000, pulse({ wantsWord: 0.3 }))).toBeNull();
    expect(beatFor(state(), m, 100_000, pulse({ wantsWord: 0.9, pressure: 0.9 }))).toEqual({
      kind: 'quiet',
      area: 'Greenwood',
      mood: 'dire',
    });
    expect(beatFor(state(), { ...m, spoke: 100_000 - 21_000 }, 100_000, pulse({ wantsWord: 0.9 }))).toBeNull(); // never chatter
  });

  it('lets the reader say when the party needs a quest', () => {
    const wait = { lastQuest: 100_000 - 25_000 };
    expect(nextStep(state(), clock(wait)).kind).toBe('idle'); // timers: 30 s not yet
    expect(nextStep(state(), clock({ ...wait, pulse: pulse({ needsQuest: 0.9 }) })).kind).toBe('quest');
    expect(nextStep(state(), clock({ ...wait, pulse: pulse({ needsQuest: 0.2 }) })).kind).toBe('idle');
    expect(nextStep(state(), clock({ lastQuest: 100_000 - 5_000, pulse: pulse({ needsQuest: 0.9 }) })).kind).toBe(
      'idle',
    );
  });
});
