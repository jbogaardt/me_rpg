import { describe, expect, it } from 'vitest';
import { BOARDS } from '../sim/board';
import { newMatch, step, type Match } from '../sim/sim';
import { RACES } from '../sim/races';
import { checksum, encode, Lockstep, makeAis, packMatch, parseMessage, unpackMatch, type Message } from './lockstep';

const STEP = 0.05;
const BASE = RACES.legion.units[0]!.id; // the castle sells its base unit from the start

/** Two pages joined by a wire; `lag` ticks of delay on every message (0 delivers at once). */
function pair(lag = 0) {
  const a: Message[] = [];
  const b: Message[] = [];
  const mA = newMatch(['legion', 'swarm']);
  const mB = newMatch(['legion', 'swarm']);
  const A: Lockstep = new Lockstep(0, { send: (m) => a.push(m) });
  const B: Lockstep = new Lockstep(1, { send: (m) => b.push(m) });
  const deliver = (from: Message[], to: Lockstep) => {
    for (const m of from.splice(0)) {
      if (m.t === 'tick') to.receive(m.n, m.c);
      else if (m.t === 'sum') to.receiveSum(m.n, m.h);
    }
  };
  const pump = (steps: number, onTick?: (t: number) => void) => {
    let t = 0;
    for (let i = 0; i < steps * (lag + 2); i++) {
      if (t < steps) onTick?.(t);
      const ra = A.run(mA, () => step(mA, STEP));
      const rb = B.run(mB, () => step(mB, STEP));
      if (ra && rb) t++;
      if (i % (lag + 1) === 0) {
        deliver(a, B);
        deliver(b, A);
      }
    }
  };
  return { A, B, mA, mB, pump };
}

describe('lockstep', () => {
  it('keeps two pages on the same match when both play', () => {
    const { A, B, mA, mB, pump } = pair();
    pump(300, (t) => {
      if (t === 10) A.issue({ k: 'train', id: BASE, n: 1 });
      if (t === 12) B.issue({ k: 'order', what: 'units', to: 'bypass' });
    });
    expect(A.tick).toBeGreaterThan(200);
    expect(A.tick).toBe(B.tick);
    expect(checksum(mA)).toBe(checksum(mB));
    expect(mB.players[1].orders.units).toBe('bypass');
    expect(A.desync || B.desync).toBe(false);
  });

  it('applies a command on the same tick on both pages, even across lag', () => {
    const { A, mA, mB, pump } = pair(3);
    pump(100, (t) => {
      if (t === 5) A.issue({ k: 'train', id: BASE, n: 1 });
    });
    expect(mA.units.length).toBeGreaterThan(0);
    expect(mA.units.length).toBe(mB.units.length);
    expect(checksum(mA)).toBe(checksum(mB));
  });

  it('waits when the other page is silent', () => {
    const m = newMatch(['legion', 'swarm']);
    const sent: Message[] = [];
    const L = new Lockstep(0, { send: (x) => sent.push(x) });
    let ran = 0;
    for (let i = 0; i < 50; i++) if (L.run(m, () => ran++)) continue;
    expect(ran).toBeLessThanOrEqual(4); // only the settled opening ticks
    expect(sent.length).toBeGreaterThan(0); // but it has told the other page what it needs to go on
  });

  it('flags a desync when the checksums differ', () => {
    const { A, B, mA, pump } = pair();
    pump(30);
    mA.players[0].wood += 5; // page A cheats: a change nobody sent
    pump(100);
    expect(A.desync || B.desync).toBe(true);
  });

  it('ignores late, repeated and far-future ticks', () => {
    const m = newMatch(['legion', 'swarm']);
    const L = new Lockstep(0, { send: () => undefined });
    L.receive(0, []);
    L.receive(9999, []);
    L.receive(4, [{ k: 'castle' }]);
    L.receive(4, [{ k: 'repair', tower: 1 }]);
    for (let i = 0; i < 4; i++) L.run(m, () => undefined);
    expect(L.ready()).toBe(true);
  });
});

describe('rejoin', () => {
  it('lets the match run on while a player is away, then brings a fresh page back in step', () => {
    const { A, mA, pump } = pair();
    pump(60, (t) => t === 5 && A.issue({ k: 'train', id: BASE, n: 2 }));
    // The rival's page goes away: A plays on alone (their castle keeps paying, their units keep walking).
    A.setAway(true);
    const before = mA.units.length;
    for (let i = 0; i < 100; i++) A.run(mA, () => step(mA, STEP));
    expect(A.tick).toBeGreaterThan(150);
    expect(mA.units.length).toBeGreaterThanOrEqual(before);
    // They come back on a new page, from what A sends them.
    const wire = parseMessage(encode({ t: 'snap', ...A.snapshot(), state: packMatch(mA) }));
    expect(wire?.t).toBe('snap');
    if (wire?.t !== 'snap') return;
    const outA: Message[] = [];
    const outB: Message[] = [];
    A.rejoin();
    (A as unknown as { link: { send(m: Message): void } }).link = { send: (m) => outA.push(m) };
    const mB = unpackMatch(wire.state);
    const B = new Lockstep(1, { send: (m) => outB.push(m) });
    B.resume(wire.n, wire.c, wire.mine);
    expect(checksum(mB)).toBe(checksum(mA));
    for (let i = 0; i < 200; i++) {
      if (i === 20) B.issue({ k: 'order', what: 'units', to: 'bypass' });
      A.run(mA, () => step(mA, STEP));
      B.run(mB, () => step(mB, STEP));
      for (const m of outA.splice(0)) if (m.t === 'tick') B.receive(m.n, m.c);
      for (const m of outB.splice(0)) if (m.t === 'tick') A.receive(m.n, m.c);
    }
    expect(A.tick).toBe(B.tick);
    expect(A.tick).toBeGreaterThan(300);
    expect(checksum(mA)).toBe(checksum(mB));
    expect(mA.players[1].orders.units).toBe('bypass');
  });
});

describe('wire', () => {
  const round = (m: Message) => parseMessage(encode(m));
  it('round-trips every message', () => {
    const msgs: Message[] = [
      { t: 'hi', v: 1, race: 'swarm' },
      { t: 'go', v: 2, map: 'desert', races: ['legion', 'titan'], seed: 7 },
      { t: 'go', v: 2, map: 'crossroads', races: ['legion', 'titan', 'swarm', 'swarm'], seed: 123456 },
      { t: 'sum', n: 40, h: 123456 },
      {
        t: 'tick',
        n: 9,
        c: [
          { k: 'build', id: 'arrow', col: 3, row: 4 },
          { k: 'train', id: 'archer', n: 5 },
          { k: 'bunker', tower: 3, unit: 'archer' },
          { k: 'garrison', tower: 3, ids: [4, 5] },
          { k: 'empty', tower: 3 },
          { k: 'order', what: 'towers', to: 'bypass' },
          { k: 'focus', ids: [1, 2], at: { kind: 'tower', id: 7 } },
          { k: 'focus', ids: [1] },
          { k: 'focus', ids: [1], at: { kind: 'castle', owner: 3 } },
          { k: 'focus', ids: [1], at: { kind: 'castle' } },
          { k: 'lane', lane: 5 },
          { k: 'route', ids: [3, 4], lane: 2 },
          { k: 'castle' },
          { k: 'upgrade', id: 'ground-damage' },
          { k: 'repair', tower: 4 },
          { k: 'sell', tower: 5 },
        ],
      },
    ];
    for (const m of msgs) expect(round(m)).toEqual(m);
  });
  it('refuses nonsense without throwing', () => {
    for (const bad of [
      'nope',
      '{}',
      '{"t":"tick","n":-1,"c":[]}',
      '{"t":"tick","n":1,"c":[{"k":"train","id":"a","n":0}]}',
      '{"t":"tick","n":1,"c":[{"k":"order","what":"x","to":"attack"}]}',
      '{"t":"tick","n":1,"c":"x"}',
      '{"t":"go","v":1,"map":"m","races":["a"],"seed":1}',
      '{"t":"go","v":1,"map":"m","races":["a","b"]}',
      '{"t":"go","v":1,"map":"m","races":["a","b","c","d","e"],"seed":1}',
      '{"t":"tick","n":1,"c":[{"k":"lane","lane":-1}]}',
      '{"t":"tick","n":1,"c":[{"k":"focus","ids":[1],"at":{"kind":"castle","owner":9}}]}',
      '{"t":"sum","n":1,"h":-5}',
    ])
      expect(parseMessage(bad)).toBeNull();
  });
});

describe('co-op: two people and computers on the other seats', () => {
  const SEED = 99;
  const board = BOARDS.crossroads!;
  const races = ['legion', 'titan', 'swarm', 'legion'] as const;
  /** The same four-seat match on two pages, each running the computers itself. */
  function coop() {
    const a: Message[] = [];
    const b: Message[] = [];
    const mA = newMatch(races, board);
    const mB = newMatch(races, board);
    const A = new Lockstep(0, { send: (m) => a.push(m) });
    const B = new Lockstep(1, { send: (m) => b.push(m) });
    const aisA = makeAis(mA, SEED, 2);
    const aisB = makeAis(mB, SEED, 2);
    const advance = (m: Match, ais: typeof aisA) => () => {
      for (const ai of ais) ai(m, STEP);
      step(m, STEP);
    };
    const pump = (ticks: number, onTick?: (t: number) => void) => {
      for (let t = 0; t < ticks; t++) {
        onTick?.(t);
        A.run(mA, advance(mA, aisA));
        B.run(mB, advance(mB, aisB));
        for (const m of a.splice(0)) if (m.t === 'tick') B.receive(m.n, m.c);
        for (const m of b.splice(0)) if (m.t === 'tick') A.receive(m.n, m.c);
      }
    };
    return { A, B, mA, mB, aisA, aisB, pump, a, b };
  }

  it('makes a computer for each seat past the people, the same on both pages', () => {
    const m = newMatch(races, board);
    expect(makeAis(m, SEED, 2)).toHaveLength(2);
    expect(makeAis(m, SEED, 4)).toHaveLength(0);
  });

  it('keeps both pages on one match while the computers play and the two people give orders', () => {
    const { A, B, mA, mB, pump } = coop();
    pump(1500, (t) => {
      if (t === 10) A.issue({ k: 'train', id: BASE, n: 2 });
      if (t === 30) B.issue({ k: 'lane', lane: board.lanes.find((l) => l.from === 1 && l.to === 2)!.id });
      if (t === 32) B.issue({ k: 'train', id: BASE, n: 2 });
    });
    expect(A.desync || B.desync).toBe(false);
    expect(A.tick).toBe(B.tick);
    expect(checksum(mA)).toBe(checksum(mB));
    // The computers did something, and seat 1 sent units down the road it chose.
    expect(mA.towers.filter((t) => t.owner >= 2).length).toBeGreaterThan(0);
    expect(mA.players[1].lane).toBe(board.lanes.find((l) => l.from === 1 && l.to === 2)!.id);
  });

  it("lets the second person back in mid-match with the computers' memory, and the pages agree again", () => {
    const { A, mA, aisA, pump, a } = coop();
    pump(800);
    // A snapshot over the wire, then a new page rebuilt from it alone (the seed came with it).
    const wire = parseMessage(encode({ t: 'snap', ...A.snapshot(), state: packMatch(mA, SEED, aisA) }));
    if (wire?.t !== 'snap') throw new Error('snapshot did not parse');
    expect(wire.state.ai).toHaveLength(2);
    A.rejoin();
    a.length = 0;
    const out: Message[] = [];
    const mB = unpackMatch(wire.state);
    const aisB = makeAis(mB, wire.state.seed, 2);
    aisB.forEach((ai, i) => ai.load(wire.state.ai[i]!));
    const B = new Lockstep(1, { send: (m) => out.push(m) });
    B.resume(wire.n, wire.c, wire.mine);
    expect(checksum(mB)).toBe(checksum(mA));
    (A as unknown as { link: { send(m: Message): void } }).link = { send: (m) => a.push(m) };
    for (let i = 0; i < 600; i++) {
      A.run(mA, () => {
        for (const ai of aisA) ai(mA, STEP);
        step(mA, STEP);
      });
      B.run(mB, () => {
        for (const ai of aisB) ai(mB, STEP);
        step(mB, STEP);
      });
      for (const m of a.splice(0)) if (m.t === 'tick') B.receive(m.n, m.c);
      for (const m of out.splice(0)) if (m.t === 'tick') A.receive(m.n, m.c);
    }
    expect(A.tick).toBe(B.tick);
    expect(checksum(mA)).toBe(checksum(mB));
  }, 60_000);
});

export type { Match };
