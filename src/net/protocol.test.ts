import { describe, expect, it } from 'vitest';
import { approach, glide } from './interp';
import {
  encodeMessage,
  packKeys,
  parseMessage,
  PROTOCOL_VERSION,
  round1,
  unpackKeys,
  type InputMsg,
  type MobSnap,
  type SnapMsg,
} from './protocol';

const mob: MobSnap = [100.5, 200, 2, 3, 20, 450, 1];
const snap: SnapMsg = {
  k: 'snap',
  n: 7,
  players: [
    [10, 20, 0, 1],
    [30, 40, 3, 6],
  ],
  mobs: [mob, [1, 2, 0, 5, 0, 5000, 0]],
  me: [2, 5, 28.5, 36, 12.2, 24, 7, 2, 10],
  events: [
    { id: 4, e: { type: 'text', x: 5, y: 6, text: '+12 XP', color: 0xffb13f } },
    { id: 5, e: { type: 'slash', x: 1, y: 2, dir: 3 } },
    { id: 6, e: { type: 'bolt', x: 1, y: 2, vx: 260, vy: 0 } },
    { id: 7, e: { type: 'defeat', player: 1 } },
    { id: 8, e: { type: 'fx', name: 'hitSpark', x: 3, y: 4, dir: 1.6 } },
    { id: 9, e: { type: 'fx', name: 'levelUp', x: 3, y: 4 } },
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
    const input: InputMsg = { k: 'in', n: 3, keys: packKeys(1, -1), act: 2, mag: 0 };
    const hello = { k: 'hello', v: PROTOCOL_VERSION, build: 'abc' } as const;
    for (const m of [input, hello, snap]) expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('keeps a full snapshot well under one network packet per 20 mobs', () => {
    const big = { ...snap, mobs: Array.from({ length: 20 }, () => mob) };
    expect(encodeMessage(big).length).toBeLessThan(1200);
  });

  it('rejects non-JSON, non-objects and unknown kinds', () => {
    for (const bad of ['', 'nope', '42', 'null', '[]', '{"k":"boom"}', '{}']) expect(parseMessage(bad)).toBeNull();
    expect(parseMessage(42)).toBeNull();
    expect(parseMessage('x'.repeat(70_000))).toBeNull();
  });

  it('rejects malformed input messages', () => {
    const base = { k: 'in', n: 1, keys: 3, act: 0, mag: 0 };
    expect(parseMessage(JSON.stringify(base))).not.toBeNull();
    for (const patch of [{ keys: 16 }, { keys: -1 }, { n: 1.5 }, { act: 'x' }, { mag: null }, { n: undefined }]) {
      expect(parseMessage(JSON.stringify({ ...base, ...patch }))).toBeNull();
    }
  });

  it('rejects malformed snapshots', () => {
    const bad: Record<string, unknown>[] = [
      { ...snap, players: [snap.players[0]] },
      { ...snap, players: [[1, 2, 9, 0], snap.players[1]] }, // direction out of range
      { ...snap, players: [[1, 2, 0, 99], snap.players[1]] }, // unknown flags
      { ...snap, mobs: [[1, 2, 0, 99, 5, 0, 0]] }, // unknown state
      { ...snap, mobs: [[1, 2, 0, 0, 5, 0]] }, // short tuple
      { ...snap, mobs: [[Infinity, 2, 0, 0, 5, 0, 0]] },
      { ...snap, mobs: 'x' },
      { ...snap, me: [1, 2, 3] },
      { ...snap, events: [{ id: 1, e: { type: 'text', x: 0, y: 0, text: 'x'.repeat(100), color: 0 } }] },
      { ...snap, events: [{ id: 1, e: { type: 'nope' } }] },
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

describe('smoothing', () => {
  it('approaches the target without overshooting, independent of step size', () => {
    const once = approach(0, 100, 0.1);
    const twice = approach(approach(0, 100, 0.05), 100, 0.05);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(100);
    expect(twice).toBeCloseTo(once, 6);
    expect(approach(5, 5, 0.1)).toBe(5);
  });

  it('glides short moves and snaps teleports', () => {
    const p = { x: 0, y: 0 };
    glide(p, 10, 0, 1 / 60);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(10);
    glide(p, 500, 500, 1 / 60);
    expect(p).toEqual({ x: 500, y: 500 });
  });
});
