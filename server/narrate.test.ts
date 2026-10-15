import { describe, expect, it } from 'vitest';
import { MockNarrator, QUIET_MS, SPOKE_GAP_MS, beatFor, type Memory } from './narrate';
import type { PageState } from './turn';

const state = (over: Partial<PageState> = {}): PageState => ({
  role: 'host',
  code: null,
  lobbyOpen: false,
  dm: true,
  waiting: 0,
  card: null,
  area: 'Greenwood',
  questing: false,
  story: null,
  friends: [{ slot: 1, area: 'Greenwood', hp: 1, near: true }],
  ...over,
});
const mem = (prev: PageState | null, spoke = 0): Memory => ({ prev, spoke });
const NOW = 1_000_000;

describe('beatFor', () => {
  it('remarks on a new area', () => {
    expect(beatFor(state({ area: 'Caves' }), mem(state(), NOW - SPOKE_GAP_MS), NOW)).toEqual({
      kind: 'arrive',
      area: 'Caves',
    });
  });
  it('remarks when a quest ends', () => {
    expect(beatFor(state(), mem(state({ questing: true }), 0), NOW)?.kind).toBe('done');
  });
  it('remarks once when a friend falls low', () => {
    const low = state({ friends: [{ slot: 1, area: 'Greenwood', hp: 0.1, near: true }] });
    expect(beatFor(low, mem(state(), 0), NOW)).toMatchObject({ kind: 'hurt', slot: 1 });
    expect(beatFor(low, mem(low, NOW - 1000), NOW)).toBeNull();
  });
  it('speaks into a long silence, not a short one', () => {
    expect(beatFor(state(), mem(state(), NOW - QUIET_MS), NOW)?.kind).toBe('quiet');
    expect(beatFor(state(), mem(state(), NOW - QUIET_MS + 5000), NOW)).toBeNull();
  });
  it('never talks over a recent line, a card, a lobby or an empty table', () => {
    const arrived = state({ area: 'Caves' });
    expect(beatFor(arrived, mem(state(), NOW - 1000), NOW)).toBeNull();
    expect(
      beatFor(state({ area: 'Caves', card: { kind: 'next', title: '', note: '', options: [] } }), mem(state()), NOW),
    ).toBeNull();
    expect(beatFor(state({ area: 'Caves', lobbyOpen: true }), mem(state()), NOW)).toBeNull();
    expect(beatFor(state({ area: 'Caves', friends: [] }), mem(state()), NOW)).toBeNull();
    expect(beatFor(arrived, mem(null), NOW)).toBeNull();
  });
});

describe('MockNarrator', () => {
  it('names the area and rotates its lines', async () => {
    const n = new MockNarrator();
    const a = await n.line({ kind: 'arrive', area: 'Caves' });
    const b = await n.line({ kind: 'arrive', area: 'Caves' });
    expect(a).toContain('Caves');
    expect(b).not.toBe(a);
  });
});
