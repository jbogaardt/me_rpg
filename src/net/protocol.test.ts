import { describe, expect, it } from 'vitest';
import {
  encodeMessage,
  packKeys,
  parseMessage,
  PROTOCOL_VERSION,
  round1,
  unpackKeys,
  type InputMsg,
  type MobSnap,
  type PlayerSnap,
  type SnapMsg,
} from './protocol';

const mob: MobSnap = [0, 100, 200, 2, 3, 20, 450, 1];
const snap: SnapMsg = {
  k: 'snap',
  n: 7,
  players: [
    [0, 10, 20, 0, 1],
    [2, 30, 40, 3, 6],
  ],
  mobs: [mob, [7, 1, 2, 0, 5, 0, 5000, 0]],
  me: [2, 5, 28.5, 36, 12.2, 24, 7, 2, 10],
  chests: 5,
  events: [
    { id: 4, e: { type: 'text', x: 5, y: 6, text: '+12 XP', color: 0xffb13f } },
    { id: 5, e: { type: 'slash', x: 1, y: 2, dir: 3, p: 2 } },
    { id: 6, e: { type: 'bolt', x: 1, y: 2, vx: 260, vy: 0, p: 1 } },
    { id: 11, e: { type: 'draw', x: 1, y: 2, p: 3 } },
    { id: 12, e: { type: 'arrow', x: 1, y: 2, vx: 300, vy: 0, range: 256 } },
    { id: 10, e: { type: 'bolt', x: 5, y: 6, vx: -135, vy: 0, color: 0xb06cff } }, // an enemy's shot
    { id: 7, e: { type: 'defeat', player: 3 } },
    { id: 8, e: { type: 'fx', name: 'hitSpark', x: 3, y: 4, dir: 1.6 } },
    { id: 9, e: { type: 'fx', name: 'levelUp', x: 3, y: 4 } },
    { id: 13, e: { type: 'fx', name: 'heroHurt', x: 3, y: 4, p: 1 } },
  ],
};

describe('keys', () => {
  it('packs and unpacks axes', () => {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) expect(unpackKeys(packKeys(dx, dy))).toEqual({ dx, dy });
    }
  });

  it('cancels opposite keys held together', () => {
    expect(unpackKeys(0b1111)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('messages', () => {
  it('round-trips each message kind', () => {
    const input: InputMsg = { k: 'in', n: 3, keys: packKeys(1, -1), act: 2, mag: 0, ack: 12, vr: 340 };
    const hello = { k: 'hello', v: PROTOCOL_VERSION, build: 'abc' } as const;
    for (const m of [input, hello, snap]) expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('keeps a busy four-player snapshot inside one network packet', () => {
    // Four players, the eight mobs near this friend and six events not yet acknowledged (the guest's `ack` trims them within a
    // round trip or two): a big fight. A message
    // over about 1.2 KB is split in transit, and on this channel losing any piece loses the whole message.
    const everyone = Array.from({ length: 4 }, (_, slot): PlayerSnap => [slot, 1234, 2345, 3, 7]);
    const near = Array.from({ length: 8 }, (_, i): MobSnap => [i, 1234 + i * 40, 2345, 3, 1, 20, 450, 1]);
    const events = Array.from({ length: 6 }, (_, id) => ({
      id: id + 1,
      e:
        id % 3 === 0
          ? ({ type: 'text', x: 1500.4, y: 850.2, text: '12', color: 0xffffff } as const)
          : id % 3 === 1
            ? ({ type: 'fx', name: 'hitSpark', x: 1500.4, y: 886.2, dir: 1.6 } as const)
            : ({ type: 'slash', x: 1500.4, y: 900.2, dir: 1, p: 2 } as const),
    }));
    const big: SnapMsg = { ...snap, players: everyone, mobs: near, events };
    expect(encodeMessage(big).length).toBeLessThan(1200);
  });

  it('accepts one to four players, in any order, and keeps their numbers', () => {
    for (const slots of [[0], [0, 3], [3, 0, 1], [0, 1, 2, 3]]) {
      const players = slots.map((slot): PlayerSnap => [slot, 1, 2, 0, 0]);
      const parsed = parseMessage(JSON.stringify({ ...snap, players }));
      expect(parsed).toMatchObject({ k: 'snap', players });
    }
  });

  it('rejects non-JSON, non-objects and unknown kinds', () => {
    for (const bad of ['', 'nope', '42', 'null', '[]', '{"k":"boom"}', '{}']) expect(parseMessage(bad)).toBeNull();
    expect(parseMessage(42)).toBeNull();
    expect(parseMessage('x'.repeat(70_000))).toBeNull();
  });

  it('rejects malformed input messages', () => {
    const base = { k: 'in', n: 1, keys: 3, act: 0, mag: 0, ack: 0, vr: 300 };
    expect(parseMessage(JSON.stringify(base))).not.toBeNull();
    for (const patch of [
      { keys: 16 },
      { keys: -1 },
      { n: 1.5 },
      { act: 'x' },
      { mag: null },
      { n: undefined },
      { ack: -1 },
      { ack: 'x' },
      { vr: 5000 },
      { vr: undefined },
    ]) {
      expect(parseMessage(JSON.stringify({ ...base, ...patch }))).toBeNull();
    }
  });

  it('rejects malformed snapshots', () => {
    const bad: Record<string, unknown>[] = [
      { ...snap, players: [] },
      { ...snap, players: 'x' },
      { ...snap, players: Array.from({ length: 5 }, (_, slot) => [slot, 1, 2, 0, 0]) }, // more than four players
      {
        ...snap,
        players: [
          [0, 1, 2, 0, 0],
          [0, 3, 4, 1, 0],
        ],
      }, // the same player twice
      { ...snap, players: [[4, 1, 2, 0, 0]] }, // player number out of range
      { ...snap, players: [[-1, 1, 2, 0, 0]] },
      { ...snap, players: [[0, 1, 2, 0]] }, // the old four-number shape
      { ...snap, players: [[0, 1, 2, 9, 0]] }, // direction out of range
      { ...snap, players: [[0, 1, 2, 0, 99]] }, // unknown flags
      { ...snap, players: [[0, Infinity, 2, 0, 0]] },
      { ...snap, mobs: [[0, 1, 2, 0, 99, 5, 0, 0]] }, // unknown state
      { ...snap, mobs: [[0, 1, 2, 0, 0, 5, 0]] }, // short tuple (no mob number)
      { ...snap, mobs: [[1, 2, 0, 0, 5, 0, 0]] }, // the old shape: no mob number
      { ...snap, mobs: [[300, 1, 2, 0, 0, 5, 0, 0]] }, // mob number out of range
      { ...snap, mobs: [[0, Infinity, 2, 0, 0, 5, 0, 0]] },
      { ...snap, mobs: 'x' },
      { ...snap, me: [1, 2, 3] },
      { ...snap, events: [{ id: 1, e: { type: 'text', x: 0, y: 0, text: 'x'.repeat(100), color: 0 } }] },
      { ...snap, events: [{ id: 1, e: { type: 'nope' } }] },
      { ...snap, events: [{ id: 1, e: { type: 'draw', x: 'a', y: 0, p: 0 } }] },
      { ...snap, events: [{ id: 1, e: { type: 'draw', x: 0, y: 0 } }] }, // no player
      { ...snap, events: [{ id: 1, e: { type: 'slash', x: 0, y: 0, dir: 0, p: 4 } }] }, // player out of range
      { ...snap, events: [{ id: 1, e: { type: 'fx', name: 'heroHurt', x: 0, y: 0, p: -1 } }] },
      { ...snap, events: [{ id: 1, e: { type: 'arrow', x: 0, y: 0, vx: 1, vy: 0 } }] }, // no range
      { ...snap, events: [{ id: 1, e: { type: 'arrow', x: 0, y: 0, vx: 1, vy: 0, range: -5 } }] },
      { ...snap, events: [{ id: 1, e: { type: 'fx', name: 'boltTrail', x: 0, y: 0 } }] }, // continuous effects stay local
      { ...snap, events: [{ id: 1, e: { type: 'fx', name: 'nope', x: 0, y: 0 } }] },
      { ...snap, events: [{ id: 1, e: { type: 'fx', name: 'hitSpark', x: 0, y: 0, dir: 'up' } }] },
      { ...snap, events: Array.from({ length: 65 }, (_, i) => ({ id: i, e: { type: 'defeat', player: 0 } })) },
      { ...snap, n: -1 },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m))).toBeNull();
  });

  it('rounds to a tenth', () => {
    expect(round1(12.3456)).toBe(12.3);
    expect(round1(-0.04)).toBe(-0);
  });
});
