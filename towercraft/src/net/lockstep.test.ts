import { describe, expect, it } from 'vitest';
import { newMatch, step, type Match } from '../sim/sim';
import { RACES } from '../sim/races';
import { checksum, encode, Lockstep, parseMessage, type Message } from './lockstep';

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

describe('wire', () => {
  const round = (m: Message) => parseMessage(encode(m));
  it('round-trips every message', () => {
    const msgs: Message[] = [
      { t: 'hi', v: 1, race: 'swarm' },
      { t: 'go', v: 1, map: 'desert', races: ['legion', 'titan'] },
      { t: 'sum', n: 40, h: 123456 },
      {
        t: 'tick',
        n: 9,
        c: [
          { k: 'build', id: 'arrow', col: 3, row: 4 },
          { k: 'train', id: 'archer', n: 5 },
          { k: 'bunker', tower: 3, unit: 'archer' },
          { k: 'order', what: 'towers', to: 'bypass' },
          { k: 'focus', ids: [1, 2], at: { kind: 'tower', id: 7 } },
          { k: 'focus', ids: [1] },
          { k: 'castle' },
          { k: 'upgrade', id: 'ground-damage' },
          { k: 'repair', tower: 4 },
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
      '{"t":"go","v":1,"map":"m","races":["a"]}',
      '{"t":"sum","n":1,"h":-5}',
    ])
      expect(parseMessage(bad)).toBeNull();
  });
});

export type { Match };
