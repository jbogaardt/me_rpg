import { describe, expect, it } from 'vitest';
import { FOLLOW_MS, HOST_RETRY_MS, QUEST_GAP_MS, nextStep, type Clock, type PageState } from './turn';

const friend = (slot: number, near = true) => ({ slot, area: 'Greenwood', hp: 1, near });
const state = (over: Partial<PageState> = {}): PageState => ({
  role: 'host',
  code: null,
  lobbyOpen: false,
  dm: true,
  waiting: 0,
  card: null,
  area: 'Greenwood',
  friends: [friend(1)],
  questing: true,
  epic: false,
  story: null,
  ...over,
});
const clock = (now = 100_000, settled = 0): Clock => ({ now, lastHost: 0, lastFollow: 0, lastQuest: 0, settled });
const card = { kind: 'easy', title: 'It is going too easy', note: '', options: [] };

describe('nextStep', () => {
  it('opens a game when nobody is in and none is open, but not over and over', () => {
    const empty = state({ friends: [], dm: false, role: 'solo' });
    expect(nextStep(empty, clock()).kind).toBe('host');
    expect(nextStep(empty, { ...clock(), lastHost: 100_000 - HOST_RETRY_MS + 1 }).kind).toBe('idle');
    expect(nextStep({ ...empty, code: 'brave-otters', lobbyOpen: true }, clock()).kind).toBe('idle');
  });

  it('begins by itself only when asked to, once enough friends are in', () => {
    const lobby = state({ code: 'brave-otters', lobbyOpen: true, friends: [friend(1), friend(2)] });
    expect(nextStep(lobby, clock(100_000, 2)).kind).toBe('idle');
    expect(nextStep(lobby, clock(100_000, 2), 3).kind).toBe('idle');
    expect(nextStep(lobby, clock(100_000, 1), 2).kind).toBe('idle'); // one is still coming back from another world
    expect(nextStep(lobby, clock(100_000, 2), 2).kind).toBe('start');
  });

  it('goes to the party when nobody is near, now and then', () => {
    const away = state({ friends: [friend(2, false), friend(3, false)] });
    expect(nextStep(away, clock())).toEqual({ kind: 'follow', slot: 2 });
    expect(nextStep(away, { ...clock(), lastFollow: 100_000 - FOLLOW_MS + 1 }).kind).toBe('idle');
  });

  it('answers the card up before opening the inbox', () => {
    expect(nextStep(state({ card, waiting: 2 }), clock()).kind).toBe('card');
    expect(nextStep(state({ waiting: 2 }), clock()).kind).toBe('inbox');
  });

  it('offers a quest when nothing is asked of the party, once the game has begun', () => {
    expect(nextStep(state({ questing: false }), clock()).kind).toBe('quest');
    expect(nextStep(state({ questing: false, epic: true }), clock()).kind).toBe('idle'); // between an epic's steps
    expect(nextStep(state({ questing: false, lobbyOpen: true, code: 'a-b' }), clock()).kind).toBe('idle');
    expect(nextStep(state({ questing: false }), { ...clock(), lastQuest: 100_000 - QUEST_GAP_MS + 1 }).kind).toBe(
      'idle',
    );
  });
});
