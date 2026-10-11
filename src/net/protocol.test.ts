import { describe, expect, it } from 'vitest';
import type { TradeCommand, TradeViewWire } from '../systems/trade';
import { approach, glide } from './interp';
import {
  encodeMessage,
  packKeys,
  parseMessage,
  type Message,
  PROTOCOL_VERSION,
  round1,
  unpackKeys,
  type DoMsg,
  type InputMsg,
  type LooksMsg,
  type PackMsg,
  type MobSnap,
  type PlayerSnap,
  type SnapMsg,
} from './protocol';

const mob: MobSnap = [0, 100, 200, 2, 3, 20, 450, 1];
const snap: SnapMsg = {
  k: 'snap',
  n: 7,
  zone: 'overworld',
  away: [3],
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
      { ...snap, zone: '' }, // no zone
      { ...snap, zone: 5 },
      { ...snap, zone: 'x'.repeat(40) },
      { ...snap, away: 'x' },
      { ...snap, away: [9] }, // no such player
      { ...snap, away: [0, 1, 2, 3] }, // everyone away: nobody is here but the recipient
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m))).toBeNull();
  });

  it('rounds to a tenth', () => {
    expect(round1(12.3456)).toBe(12.3);
    expect(round1(-0.04)).toBe(-0);
  });
});

describe('trade, pack and looks messages', () => {
  const ask: DoMsg = { k: 'do', n: 3, op: 'buy', item: 4, shop: 'smithy' };
  const pack: PackMsg = {
    k: 'pack',
    n: 8,
    gold: 120,
    worn: [1, 0, 0, 0, 0, 0, 27, 0, 0],
    items: [1, 28, 28],
    say: { id: 3, text: 'Bought it', ok: true },
  };
  const { say: _say, ...packNoSay } = pack;
  const looks: LooksMsg = {
    k: 'looks',
    n: 9,
    players: [
      [0, 1, 0, 0, 0, 0, 0, 27, 0, 0],
      [2, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  };

  it('round-trips', () => {
    for (const m of [ask, pack, packNoSay, looks]) expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it("keeps a full pack and everyone's gear small", () => {
    const big = { ...pack, items: Array.from({ length: 60 }, () => 28) };
    expect(encodeMessage(big).length).toBeLessThan(1200);
    expect(
      encodeMessage({ ...looks, players: [0, 1, 2, 3].map((p) => [p, 1, 2, 3, 4, 5, 6, 7, 8, 9]) }).length,
    ).toBeLessThan(200);
  });

  it('rejects requests for things that do not exist', () => {
    for (const patch of [
      { op: 'steal' },
      { item: 9999 },
      { item: -1 },
      { shop: 'x'.repeat(40) },
      { shop: 5 },
      { n: 'x' },
    ]) {
      expect(parseMessage(JSON.stringify({ ...ask, ...patch })), JSON.stringify(patch)).toBeNull();
    }
  });

  it('rejects a malformed pack', () => {
    const bad = [
      { ...pack, gold: -1 },
      { ...pack, gold: 1.5 },
      { ...pack, worn: [1, 2] },
      { ...pack, worn: [1, 0, 0, 0, 0, 0, 9999, 0, 0] },
      { ...pack, items: [9999] },
      { ...pack, items: Array.from({ length: 201 }, () => 1) },
      { ...pack, say: { id: 1, text: 'x'.repeat(100), ok: true } },
      { ...pack, say: { id: 1, text: 'hi' } },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m))).toBeNull();
  });

  it('rejects malformed looks', () => {
    const bad = [
      { ...looks, players: [] },
      { ...looks, players: [[4, 0, 0, 0, 0, 0, 0, 0, 0, 0]] }, // no such player
      { ...looks, players: [[0, 0, 0]] },
      { ...looks, players: [[0, 9999, 0, 0, 0, 0, 0, 0, 0, 0]] },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m))).toBeNull();
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

describe('trade messages', () => {
  const side = { items: [1, 2], gold: 5, ready: false };
  const view: TradeViewWire = { phase: 'open', with: 1, mine: side, theirs: { ...side, ready: true } };

  it('round-trips each command and a trade state', () => {
    const cmds: TradeCommand[] = [
      { c: 'ask', with: 2 },
      { c: 'yes' },
      { c: 'no' },
      { c: 'offer', items: [1, 2], gold: 10 },
      { c: 'ready', on: true },
      { c: 'cancel' },
    ];
    for (const cmd of cmds) {
      const m: Message = { k: 'tr', n: 1, cmd };
      expect(parseMessage(encodeMessage(m))).toEqual(m);
    }
    const states: Message[] = [
      { k: 'trade', n: 1, ack: 3, view },
      { k: 'trade', n: 2, ack: 3, view: null, note: { id: 4, text: 'Trade complete', ok: true } },
    ];
    for (const m of states) expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('rejects malformed trade traffic', () => {
    const bad: unknown[] = [
      { k: 'tr', n: 0, cmd: { c: 'yes' } }, // commands are numbered from 1
      { k: 'tr', n: 1, cmd: { c: 'ask', with: 9 } },
      { k: 'tr', n: 1, cmd: { c: 'offer', items: [1], gold: -1 } },
      { k: 'tr', n: 1, cmd: { c: 'offer', items: [999999], gold: 1 } },
      { k: 'tr', n: 1, cmd: { c: 'offer', items: new Array(13).fill(1), gold: 1 } },
      { k: 'tr', n: 1, cmd: { c: 'ready', on: 'yes' } },
      { k: 'tr', n: 1, cmd: { c: 'steal' } },
      { k: 'trade', n: 1, ack: 0, view: { ...view, phase: 'bogus' } },
      { k: 'trade', n: 1, ack: 0, view: { ...view, mine: { items: [1], gold: 'x', ready: true } } },
      { k: 'trade', n: 1, ack: 0, view: undefined },
      { k: 'trade', n: 1, ack: 0, view: null, note: { id: 1, text: 'x'.repeat(200), ok: true } },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m)), JSON.stringify(m)).toBeNull();
  });
});
