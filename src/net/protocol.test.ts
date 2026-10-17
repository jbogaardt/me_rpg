import { CLIMATES, PRECIPS, WIND_LEVELS, Weather } from '../systems/weather';
import { describe, expect, it } from 'vitest';
import type { TradeCommand, TradeViewWire } from '../systems/trade';
import { MAX_GROUND } from '../systems/inventory';
import { MAX_SAY_CUED } from '../systems/cues';
import { fitEvents, SNAP_BUDGET } from './feed';
import {
  pondsFromWire,
  pondsWire,
  decodeEvent,
  encodeEvent,
  encodeMessage,
  mergeSnapshots,
  packKeys,
  parseMessage,
  type Message,
  PROTOCOL_VERSION,
  round1,
  unpackKeys,
  type DoMsg,
  type InputMsg,
  type LooksMsg,
  type WorldMsg,
  type DmMsg,
  type PackMsg,
  type GroundSnap,
  type MobSnap,
  type PlayerSnap,
  type SnapMsg,
  type WorldEvent,
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
  crops: [0, 3, 6, 5],
  w: [0, 0, 0, 1],
  ground: [[3, 40.5, 50, 2, 150]],
  events: (
    [
      [4, { type: 'text', x: 5, y: 6, text: '+12 XP', color: 0xffb13f }],
      [5, { type: 'slash', x: 1, y: 2, dir: 3, p: 2 }],
      [6, { type: 'bolt', x: 1, y: 2, vx: 260, vy: 0, p: 1 }],
      [11, { type: 'draw', x: 1, y: 2, p: 3 }],
      [12, { type: 'arrow', x: 1, y: 2, vx: 300, vy: 0, range: 256, p: 2 }],
      [15, { type: 'arrow', x: 1, y: 2, vx: 300, vy: 0, range: 256 }],
      [10, { type: 'bolt', x: 5, y: 6, vx: -135, vy: 0, color: 0xb06cff }], // an enemy's shot
      [14, { type: 'lightning', x: 100, y: 200, seed: 123456789 }],
      [7, { type: 'defeat', player: 3 }],
      [8, { type: 'fx', name: 'hitSpark', x: 3, y: 4, dir: 1.6 }],
      [9, { type: 'fx', name: 'levelUp', x: 3, y: 4 }],
      [13, { type: 'fx', name: 'heroHurt', x: 3, y: 4, p: 1 }],
    ] satisfies [number, WorldEvent][]
  ).map(([id, e]) => encodeEvent(id, e)),
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
    const input: InputMsg = { k: 'in', n: 3, keys: packKeys(1, -1), act: 2, cb: 0, ci: 0, ack: 12, vr: 340 };
    const hello = { k: 'hello', v: PROTOCOL_VERSION, build: 'abc' } as const;
    for (const m of [input, hello, snap]) expect(parseMessage(encodeMessage(m))).toEqual(m);
    const named = { ...hello, id: 'abc123def456' };
    expect(parseMessage(encodeMessage(named))).toEqual(named);
    expect(parseMessage(JSON.stringify({ ...hello, id: 'no spaces allowed' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...hello, id: 'x' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...hello, id: 7 }))).toBeNull();
  });

  it('carries the acknowledged input number of a snapshot', () => {
    const withIa: SnapMsg = { ...snap, ia: 42 };
    expect(parseMessage(encodeMessage(withIa))).toEqual(withIa);
  });

  it('keeps a busy four-player snapshot inside one network packet', () => {
    // Four players, the eight mobs near this friend, a full ground list and a fight's worth of events not yet
    // acknowledged, trimmed to the room the rest leaves (as the host does). A message over about 1.2 KB is split in
    // transit, and on this channel losing any piece loses the whole message.
    const everyone = Array.from({ length: 4 }, (_, slot): PlayerSnap => [slot, 1234, 2345, 3, 7]);
    const near = Array.from({ length: 8 }, (_, i): MobSnap => [i, 1234 + i * 40, 2345, 3, 1, 20, 450, 1]);
    const ground = Array.from({ length: MAX_GROUND }, (_, i): GroundSnap => [100 + i, 1234, 2345, 25, 179]);
    const fight = Array.from({ length: 48 }, (_, i) => {
      const e: WorldEvent =
        i % 3 === 0
          ? { type: 'text', x: 1500.4, y: 850.2, text: '12', color: 0xffffff }
          : i % 3 === 1
            ? { type: 'fx', name: 'hitSpark', x: 1500.4, y: 886.2, dir: 1.6 }
            : { type: 'slash', x: 1500.4, y: 900.2, dir: 1, p: 2 };
      const wire = encodeEvent(100_000 + i, e);
      return { wire, size: JSON.stringify(wire).length };
    });
    for (const g of [ground, ground.slice(0, 2)]) {
      const big: SnapMsg = { ...snap, n: 123_456, players: everyone, mobs: near, ground: g, events: [] };
      big.events = fitEvents(fight, SNAP_BUDGET - encodeMessage(big).length, 48);
      expect(big.events.length).toBeGreaterThanOrEqual(6);
      expect(encodeMessage(big).length).toBeLessThan(1200);
    }
  });

  it('round-trips every kind of event, in whole pixels', () => {
    for (const wire of snap.events) {
      const ev = decodeEvent(wire);
      expect(ev).not.toBeNull();
      expect(encodeEvent(ev!.id, ev!.e)).toEqual(wire);
    }
    expect(encodeEvent(1, { type: 'slash', x: 10.6, y: 20.2, dir: 1, p: 0 })).toEqual([1, 0, 11, 20, 1, 0]);
    expect(decodeEvent(encodeEvent(2, { type: 'fx', name: 'heroHurt', x: 1, y: 2, p: 3 }))).toEqual({
      id: 2,
      e: { type: 'fx', name: 'heroHurt', x: 1, y: 2, p: 3 },
    });
    expect(decodeEvent(encodeEvent(3, { type: 'bolt', x: 1, y: 2, vx: 3, vy: 4 }))?.e).toEqual({
      type: 'bolt',
      x: 1,
      y: 2,
      vx: 3,
      vy: 4,
    });
  });

  it('merges two snapshots that arrived in one frame, keeping what the older said that the newer leaves out', () => {
    const older: SnapMsg = {
      ...snap,
      n: 1,
      mobs: [
        [1, 1, 1, 0, 0, 5, 0, 0],
        [2, 2, 2, 0, 0, 5, 0, 0],
      ],
      events: [
        [1, 6, 0],
        [2, 6, 1],
      ],
    };
    const newer: SnapMsg = {
      ...snap,
      n: 2,
      mobs: [[2, 9, 9, 0, 0, 4, 0, 1]],
      events: [
        [2, 6, 1],
        [3, 6, 2],
      ],
    };
    delete newer.ground;
    const merged = mergeSnapshots(older, newer);
    expect(merged.n).toBe(2);
    expect(merged.mobs).toEqual([
      [1, 1, 1, 0, 0, 5, 0, 0],
      [2, 9, 9, 0, 0, 4, 0, 1],
    ]);
    expect(merged.events).toEqual([
      [1, 6, 0],
      [2, 6, 1],
      [3, 6, 2],
    ]);
    expect(merged.ground).toEqual(older.ground);
    expect(mergeSnapshots(older, { ...newer, ground: [] }).ground).toEqual([]); // a newer list wins, even empty
    expect(mergeSnapshots(older, { ...newer, zone: 'shop_smithy' })).toEqual({ ...newer, zone: 'shop_smithy' });
  });

  it('accepts one to four players, in any order, and keeps their numbers', () => {
    for (const slots of [[0], [0, 3], [3, 0, 1], [0, 1, 2, 3]]) {
      const players = slots.map((slot): PlayerSnap => [slot, 1, 2, 0, 0]);
      const parsed = parseMessage(JSON.stringify({ ...snap, players }));
      expect(parsed).toMatchObject({ k: 'snap', players });
    }
  });

  it('carries the host weather to a guest through the wire format', () => {
    const host = new Weather(CLIMATES.temperate, () => 0.5);
    host.force('storm', WIND_LEVELS.gale);
    host.windDir = -1;
    const received = parseMessage(encodeMessage({ ...snap, w: host.snapshot() }));
    expect(received?.k).toBe('snap');
    const guest = new Weather(CLIMATES.temperate, () => 0.5);
    if (received?.k === 'snap') guest.setRemote(received.w);
    expect(guest.precip).toBe('storm');
    expect(guest.windLevel).toBeCloseTo(WIND_LEVELS.gale, 2);
    expect(guest.windDir).toBe(-1);
    expect(guest.intensity).toBe(1);
  });

  it('rejects a weather that is not one of the known precipitations, or out of range', () => {
    for (const w of [
      [PRECIPS.length + 1, 0, 100, 1],
      [-1, 0, 100, 1],
      [1, 101, 100, 1],
      [1, 0, 101, 1],
      [1, 0, 100, 2],
      [1, 0, 100],
    ])
      expect(parseMessage(JSON.stringify({ ...snap, w }))).toBeNull();
  });

  it('rejects a lightning event with a bad seed or place', () => {
    for (const e of [
      [1, 7, 1, 2, -1],
      [1, 7, 1, 2, 2 ** 33],
      [1, 7, 1, 3],
    ]) {
      expect(parseMessage(JSON.stringify({ ...snap, events: [e] }))).toBeNull();
    }
  });

  it('rejects a snapshot whose weather is out of range', () => {
    for (const w of [[7, 0, 1], [0, 101, 1], [0, 0, 2], [0, 0], 'rain', null, [0.5, 0, 1]]) {
      expect(parseMessage(JSON.stringify({ ...snap, w }))).toBeNull();
    }
  });

  it('rejects non-JSON, non-objects and unknown kinds', () => {
    for (const bad of ['', 'nope', '42', 'null', '[]', '{"k":"boom"}', '{}']) expect(parseMessage(bad)).toBeNull();
    expect(parseMessage(42)).toBeNull();
    expect(parseMessage('x'.repeat(70_000))).toBeNull();
  });

  it('rejects malformed input messages', () => {
    const base = { k: 'in', n: 1, keys: 3, act: 0, cb: 0, ci: 0, ack: 0, vr: 300 };
    expect(parseMessage(JSON.stringify(base))).not.toBeNull();
    for (const patch of [
      { keys: 16 },
      { keys: -1 },
      { n: 1.5 },
      { act: 'x' },
      { cb: null },
      { ci: 8 },
      { n: undefined },
      { ack: -1 },
      { ack: 'x' },
      { vr: 5000 },
      { vr: undefined },
      { am: 0 },
      { am: 65 },
      { am: 'x' },
    ]) {
      expect(parseMessage(JSON.stringify({ ...base, ...patch }))).toBeNull();
    }
  });

  it('carries a guest reading a quest conversation, and refuses any other value', () => {
    const base = { k: 'in', n: 1, keys: 0, act: 0, cb: 0, ci: 0, ack: 0, vr: 300 };
    expect(parseMessage(JSON.stringify({ ...base, rd: 1 }))).toEqual({ ...base, rd: 1 });
    expect(parseMessage(JSON.stringify(base))).toEqual(base);
    expect(parseMessage(JSON.stringify({ ...base, rd: 2 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...base, rd: true }))).toBeNull();
  });

  it('carries the mouse aim of an input when there is one', () => {
    const msg = { k: 'in', n: 1, keys: 0, act: 0, cb: 0, ci: 0, ack: 0, vr: 300, am: 17 };
    expect(parseMessage(JSON.stringify(msg))).toEqual(msg);
  });

  it('carries one Inventory action in an input, and rejects a malformed one', () => {
    const base = { k: 'in', n: 1, keys: 0, act: 0, cb: 0, ci: 0, ack: 0, vr: 300 };
    const ok = { ...base, inv: [3, 0, 2, -1] };
    expect(parseMessage(JSON.stringify(ok))).toEqual(ok);
    for (const inv of [
      [0, 0, 2, 0],
      [1, 0, 2],
      [1, 0, 2, 0, 0],
      'x',
      [1, 0, 'a', 0],
      [1.5, 0, 0, 0],
      [-1, 0, 0, 0],
      [1, 9999, 0, 0],
    ]) {
      expect(parseMessage(JSON.stringify({ ...base, inv }))).toBeNull();
    }
  });

  it('carries the fuse Inventory action (v45): a gem in the pack set in a pack piece or, negative, a worn slot', () => {
    const base = { k: 'in', n: 1, keys: 0, act: 0, cb: 0, ci: 0, ack: 0, vr: 300 };
    for (const inv of [
      [4, 5, 2, 7],
      [5, 5, 0, -3],
    ])
      expect(parseMessage(JSON.stringify({ ...base, inv }))).toEqual({ ...base, inv });
  });

  it('takes a snapshot that leaves the ground out (unchanged) and keeps one that lists it', () => {
    const { ground: _listed, ...without } = { ...snap, ground: [[100, 1, 2, 25, 179]] satisfies GroundSnap[] };
    const parsed = parseMessage(JSON.stringify(without)) as SnapMsg;
    expect(parsed).not.toBeNull();
    expect('ground' in parsed).toBe(false); // absent stays absent: the guest keeps the items it has
    const listed = { ...snap, ground: [[100, 1, 2, 25, 179]] satisfies GroundSnap[] };
    expect((parseMessage(JSON.stringify(listed)) as SnapMsg).ground).toEqual(listed.ground);
    expect((parseMessage(JSON.stringify({ ...snap, ground: [] })) as SnapMsg).ground).toEqual([]); // emptied: say so
  });

  it('rejects a snapshot with bad ground items', () => {
    const bad: Record<string, unknown>[] = [
      { ...snap, ground: Array.from({ length: 17 }, (_, i) => [i, 1, 2, 1, 60]) }, // too many
      { ...snap, ground: [[1, 2, 3, 0, 60]] }, // nothing is not an item
      { ...snap, ground: [[1, 2, 3, 9999, 60]] }, // no such item
      { ...snap, ground: [[1, Infinity, 3, 1, 60]] },
      { ...snap, ground: [[1, 2, 3, 1]] }, // no time left given
      { ...snap, ground: [[1, 2, 3, 1, -1]] },
      { ...snap, ground: [[1, 2, 3, 1, 9999]] }, // longer than an item lasts
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m)), JSON.stringify(m).slice(0, 80)).toBeNull();
  });

  it('rejects a snapshot with bad crop states', () => {
    const bad: Record<string, unknown>[] = [
      { ...snap, crops: Array.from({ length: 31 }, () => 6) }, // too many plots
      { ...snap, crops: [7] }, // no such state
      { ...snap, crops: [-1] },
      { ...snap, crops: [1.5] },
      { ...snap, crops: 3 },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m)), JSON.stringify(m).slice(0, 80)).toBeNull();
  });

  it('carries moved barrels in a snapshot, and rejects a bad list', () => {
    const base = parseMessage(JSON.stringify(snap));
    expect(base?.k).toBe('snap');
    const withBarrels = parseMessage(JSON.stringify({ ...snap, barrels: [0, 100, 120, 0, 2, 40, 50, 1] }));
    expect(withBarrels && withBarrels.k === 'snap' ? withBarrels.barrels : null).toEqual([
      0, 100, 120, 0, 2, 40, 50, 1,
    ]);
    expect(parseMessage(JSON.stringify({ ...snap, barrels: [0, 1, 2] }))).toBeNull();
  });

  it('carries the roaming people in a snapshot, and rejects a bad list', () => {
    const withFolk = parseMessage(JSON.stringify({ ...snap, folk: [120, 340, 2, 50, 60, 0] }));
    expect(withFolk && withFolk.k === 'snap' ? withFolk.folk : null).toEqual([120, 340, 2, 50, 60, 0]);
    const none = parseMessage(JSON.stringify(snap));
    expect(none && none.k === 'snap' ? none.folk : 'x').toBeUndefined();
    for (const folk of [[1, 2], [1, 2, 7], [1.5, 2, 0], 'x'])
      expect(parseMessage(JSON.stringify({ ...snap, folk }))).toBeNull();
  });

  it('carries drained ponds, and rejects bad ones', () => {
    const wire = pondsWire([
      [42, 0.5, false],
      [7, 0.0001, false],
      [9, 1, true], // drunk dry, filling up again
    ]);
    expect(wire).toEqual([42, 500, 7, 1, 9, -1000]);
    expect(pondsWire([])).toBeUndefined();
    const m = { ...snap, ponds: wire };
    expect(parseMessage(JSON.stringify(m))).toEqual(m);
    expect(pondsFromWire(wire)).toEqual([
      [42, 0.5, false],
      [7, 0.001, false],
      [9, 1, true],
    ]);
    const bad: Record<string, unknown>[] = [
      { ...snap, ponds: [1] }, // no level
      { ...snap, ponds: [1, 0] }, // a full pond is not listed
      { ...snap, ponds: [1, 1001] },
      { ...snap, ponds: [1, -1001] },
      { ...snap, ponds: [-1, 5] },
      { ...snap, ponds: [1.5, 5] },
      { ...snap, ponds: Array.from({ length: 34 }, () => 1) }, // too many
    ];
    for (const b of bad) expect(parseMessage(JSON.stringify(b)), JSON.stringify(b).slice(0, 80)).toBeNull();
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
      { ...snap, players: [[0, 1, 2, 0, 200]] }, // unknown flags
      { ...snap, players: [[0, Infinity, 2, 0, 0]] },
      { ...snap, mobs: [[0, 1, 2, 0, 99, 5, 0, 0]] }, // unknown state
      { ...snap, mobs: [[0, 1, 2, 0, 0, 5, 0]] }, // short tuple (no mob number)
      { ...snap, mobs: [[1, 2, 0, 0, 5, 0, 0]] }, // the old shape: no mob number
      { ...snap, mobs: [[300, 1, 2, 0, 0, 5, 0, 0]] }, // mob number out of range
      { ...snap, mobs: [[0, Infinity, 2, 0, 0, 5, 0, 0]] },
      { ...snap, mobs: 'x' },
      { ...snap, me: [1, 2, 3] },
      { ...snap, ia: -1 },
      { ...snap, ia: 'x' },
      { ...snap, events: [[1, 4, 0, 0, 'x'.repeat(100), 0]] }, // text too long
      { ...snap, events: [[1, 9, 0, 0]] }, // unknown kind
      { ...snap, events: [{ id: 1, e: { type: 'defeat', player: 0 } }] }, // the old object form
      { ...snap, events: [[1, 2, 'a', 0, 0]] },
      { ...snap, events: [[1, 2, 0, 0]] }, // draw: no player
      { ...snap, events: [[1, 0, 0, 0, 0, 4]] }, // slash: player out of range
      { ...snap, events: [[1, 0, 0, 0, 0, 1, 7]] }, // slash: too long
      { ...snap, events: [[-1, 6, 0]] }, // bad id
      { ...snap, events: [[1, 5, 3, 0, 0, null, -1]] }, // fx: bad player
      { ...snap, events: [[1, 3, 0, 0, 1, 0]] }, // arrow: no range
      { ...snap, events: [[1, 3, 0, 0, 1, 0, -5]] },
      { ...snap, events: [[1, 1, 0, 0, 1, 0, -1, 0x1000000]] }, // bolt: colour out of range
      { ...snap, events: [[1, 5, 12, 0, 0]] }, // fx: no such one-shot effect (continuous ones stay local)
      { ...snap, events: [[1, 5, 'hitSpark', 0, 0]] },
      { ...snap, events: [[1, 5, 0, 0, 0, 'up']] },
      { ...snap, events: Array.from({ length: 65 }, (_, i) => [i, 6, 0]) },
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

type Task = [number, number, number, number, string, number, number, string, number, number, string];

describe('the Dungeon Master’s word and the party’s votes', () => {
  const dm: DmMsg = {
    k: 'dm',
    n: 4,
    shift: -0.25,
    dials: { guide: false, weather: true },
    vote: { id: 2, options: ['Into frost lands, over a thaw crossing', 'Into swamp lands'], tally: [2, 1], yours: 0 },
  };

  it('round-trips the dials, the clock and an open vote', () => {
    expect(parseMessage(encodeMessage(dm))).toEqual(dm);
    expect(parseMessage(encodeMessage({ ...dm, vote: null }))).toEqual({ ...dm, vote: null });
    const input = { k: 'in', n: 1, keys: 0, act: 0, cb: 0, ci: 0, ack: 0, vr: 300, vt: [2, 1] };
    expect(parseMessage(JSON.stringify(input))).toEqual(input);
  });

  it('round-trips what the DM says and refuses a saying that is empty, too long or not a pair', () => {
    const said = { ...dm, say: [3, 'The fen stirs.'] as [number, string] };
    expect(parseMessage(encodeMessage(said))).toEqual(said);
    for (const say of [[3, ''], [3, 'x'.repeat(MAX_SAY_CUED + 1)], [-1, 'hi'], ['a', 'hi'], [3], 'hi'])
      expect(parseMessage(JSON.stringify({ ...dm, say }))).toBeNull();
  });

  it('carries the DM’s director cues in what is said and in a private reply (v45)', () => {
    const tagged =
      'He lunges <cue:anim actor="p1" action="lunge" dir="right" />and the lantern <cue:sfx name="glass_break" />bursts.';
    const said = { ...dm, say: [4, tagged] as [number, string], reply: [1, tagged] as [number, string] };
    expect(parseMessage(encodeMessage(said))).toEqual(said);
  });

  it('round-trips the DM’s private reply and refuses one that is empty, too long or not a pair', () => {
    const reply = { ...dm, reply: [2, 'On my way.'] as [number, string] };
    expect(parseMessage(encodeMessage(reply))).toEqual(reply);
    for (const r of [[2, ''], [2, 'x'.repeat(MAX_SAY_CUED + 1)], [-1, 'hi'], ['a', 'hi'], [2], 'hi'])
      expect(parseMessage(JSON.stringify({ ...dm, reply: r }))).toBeNull();
  });

  it('round-trips a quest the DM gave and refuses one that is not a quest', () => {
    const quest = [0, 0, 2, 5, 'the_fen', 512, 99, 'Hunt 5 Goblins', 0, 1, 'goblin'] as Task;
    const task = { ...dm, task: quest };
    expect(parseMessage(encodeMessage(task))).toEqual(task);
    const arrow = { ...dm, task: [0, 0, 2, 5, 'the_fen', 512, 99, 'Hunt 5 Goblins', 0, 2, 'goblin'] as Task }; // v44: an arrow
    expect(parseMessage(encodeMessage(arrow))).toEqual(arrow);
    // v45: a boss (what is "kind:health") and a mastery (what is "spell:keys"), the 7th and 8th kinds
    const boss = {
      ...dm,
      task: [6, 0, 0, 1, 'the_fen', 512, 99, 'Slay the Hollow Goblin King', 0, 1, 'goblin:480'] as Task,
    };
    expect(parseMessage(encodeMessage(boss))).toEqual(boss);
    const master = {
      ...dm,
      task: [7, 0, 1, 3, 'the_fen', 512, 99, 'Master Arcane Bolt: cast it 3 times', 0, 0, 'bolt:uurl'] as Task,
    };
    expect(parseMessage(encodeMessage(master))).toEqual(master);
    const forge = {
      ...dm,
      task: [8, 0, 0, 1, 'the_fen', 512, 99, 'Set an Emerald in a Steel Sword', 0, 0, 'steelSword+emerald'] as Task,
    }; // v47: a forge quest
    expect(parseMessage(encodeMessage(forge))).toEqual(forge);
    const broken = [
      [9, 0, 0, 1, 'z', 0, 0, 'x', 0, 0, ''], // a kind this version does not have
      [0, 0, 0, 1, '', 0, 0, 'x', 0, 0, ''],
      [0, 0, 0, 1, 'z', 0, 0, '', 0, 0, ''],
      [0, 0, 0, 1, 'z', 0, 0, 'x', 0, 3, ''],
      [0, 0, 0, 1, 'z', 0, 0, 'x', 0, 0],
      'defend',
      7,
    ];
    for (const bad of broken) expect(parseMessage(JSON.stringify({ ...dm, task: bad }))).toBeNull();
  });

  it('round-trips stopped time and refuses a hold that is not 1', () => {
    const held = { ...dm, hold: 1 as const };
    expect(parseMessage(encodeMessage(held))).toEqual(held);
    for (const hold of [0, 2, true, 'yes']) expect(parseMessage(JSON.stringify({ ...dm, hold }))).toBeNull();
  });

  it('refuses a dial that is not one, a tally that does not match, or a vote for a choice that is not there', () => {
    const bad = [
      { ...dm, dials: { coop: false } },
      { ...dm, dials: { map: 'off' } },
      { ...dm, shift: 3 },
      { ...dm, vote: { ...dm.vote!, tally: [1] } },
      { ...dm, vote: { ...dm.vote!, yours: 2 } },
      { ...dm, vote: { ...dm.vote!, options: [], tally: [] } },
      { ...dm, vote: { ...dm.vote!, options: ['x'.repeat(200), 'y'] } },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m)), JSON.stringify(m).slice(0, 80)).toBeNull();
    const input = { k: 'in', n: 1, keys: 0, act: 0, cb: 0, ci: 0, ack: 0, vr: 300 };
    expect(parseMessage(JSON.stringify({ ...input, vt: [2, 9] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...input, vt: [2] }))).toBeNull();
    // a friend's request to the DM: [counter, which], the counter above zero and the request one that exists
    expect(parseMessage(JSON.stringify({ ...input, rq: [1, 2] }))).toMatchObject({ rq: [1, 2] });
    expect(parseMessage(JSON.stringify({ ...input, rq: [0, 2] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...input, rq: [1, 99] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...input, rq: [1] }))).toBeNull();
    // a friend's own words ride as the third value, only with the code that means words, and are never empty or long
    expect(parseMessage(JSON.stringify({ ...input, rq: [2, 7, 'help at the bridge'] }))).toMatchObject({
      rq: [2, 7, 'help at the bridge'],
    });
    expect(parseMessage(JSON.stringify({ ...input, rq: [2, 7] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...input, rq: [2, 3, 'words with a canned code'] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...input, rq: [2, 7, ''] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...input, rq: [2, 7, 'x'.repeat(121)] }))).toBeNull();
  });
});

describe('a live world’s log', () => {
  const step = {
    t: 'step',
    region: 'frostfen',
    pairing: 'thaw_road',
    from: 'east',
    to: 'west',
    foes: { common: 'goblin' },
  };
  const world: WorldMsg = { k: 'world', n: 3, total: 5, from: 2, entries: [step, { ...step, region: 'barrow' }] };

  it('round-trips a stretch of the log, small enough for one packet', () => {
    expect(parseMessage(encodeMessage(world))).toEqual(world);
    const full: WorldMsg = { ...world, entries: [step, step, step] };
    expect(encodeMessage(full).length).toBeLessThan(1100);
  });

  it('carries the DM’s person saying something else (a voice entry)', () => {
    const voice = { t: 'voice', id: 'dm_wren', lines: ['You found the keeper. Good.'] };
    const m: WorldMsg = { ...world, entries: [step, voice] };
    expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('carries the DM rewriting a signpost (a sign entry), and giving it back (no lines)', () => {
    const sign = { t: 'sign', region: 'r_ash', col: 12, row: 40, lines: ['Beware the goat.', 'Seriously.'] };
    const m: WorldMsg = { ...world, entries: [step, sign, { ...sign, lines: [] }] };
    expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('refuses a stretch that is too long, runs past the log, or holds something that is not an entry', () => {
    const bad = [
      { ...world, entries: [step, step, step, step] },
      { ...world, from: 4 },
      { ...world, entries: [] },
      { ...world, entries: [[1, 2]] },
      { ...world, entries: [{ region: 'x' }] },
      { ...world, entries: [{ t: 'step', lines: 'x'.repeat(900) }] },
      { ...world, total: 100000 },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m)), JSON.stringify(m).slice(0, 80)).toBeNull();
  });
});

describe('trade, pack and looks messages', () => {
  const ask: DoMsg = { k: 'do', n: 3, op: 'buy', item: 4, shop: 'smithy' };
  const pack: PackMsg = {
    k: 'pack',
    n: 8,
    gold: 120,
    worn: [1, 0, 0, 0, 0, 0, 27, 0, 0, 0],
    items: [1, 28, 28],
    ack: 2,
    quests: [4, 1, 5],
    skills: 1,
    loadout: 1,
    needs: [80, 45],
    say: { id: 3, text: 'Bought it', ok: true },
  };
  const { say: _say, ...packNoSay } = pack;
  const looks: LooksMsg = {
    k: 'looks',
    n: 9,
    players: [
      [0, 1, 0, 0, 0, 0, 0, 27, 0, 0, 0],
      [2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  };

  it('round-trips', () => {
    const talk: DoMsg = { k: 'do', n: 4, op: 'talk', item: 0, shop: 'maren' };
    const told: PackMsg = { ...pack, say: { id: 4, text: '', ok: true, story: 'road.offer' } };
    const train: DoMsg = { k: 'do', n: 5, op: 'train', item: 0, shop: 'orin' };
    const drink: DoMsg = { k: 'do', n: 6, op: 'drink', item: 1, shop: '' };
    for (const m of [ask, talk, train, drink, told, pack, packNoSay, looks])
      expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it("keeps a full pack and everyone's gear small", () => {
    const big = { ...pack, items: Array.from({ length: 60 }, () => 28) };
    expect(encodeMessage(big).length).toBeLessThan(1200);
    expect(
      encodeMessage({ ...looks, players: [0, 1, 2, 3].map((p) => [p, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) }).length,
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
      { ...pack, worn: [1, 0, 0, 0, 0, 0, 9999, 0, 0, 0] },
      { ...pack, quests: [99, 0, 0] },
      { ...pack, quests: [1, 0] },
      { ...pack, quests: undefined },
      { ...pack, skills: 16 },
      { ...pack, skills: undefined },
      { ...pack, loadout: 99 },
      { ...pack, loadout: undefined },
      { ...pack, say: { id: 1, text: '', ok: true, story: 'No Way!' } },
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
      { ...looks, players: [[4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]] }, // no such player
      { ...looks, players: [[0, 0, 0]] },
      { ...looks, players: [[0, 9999, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
    ];
    for (const m of bad) expect(parseMessage(JSON.stringify(m))).toBeNull();
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
