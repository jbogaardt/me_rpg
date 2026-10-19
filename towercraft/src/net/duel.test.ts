import { describe, expect, it } from 'vitest';
import type { Link, LinkHandlers, LinkRole } from '../../../src/net/PeerLink';
import { RelayError } from '../../../src/net/relayClient';
import { Duel, type DuelPhase, type Relay } from './duel';
import type { Message } from './lockstep';

/** A relay in memory: one room, one seat. */
function fakeRelay(): Relay {
  let offer = '';
  let answer = '';
  let notify: (() => void) | undefined;
  return {
    createRoom: (offers) => {
      offer = offers[0]!;
      return Promise.resolve({ code: 'mighty-apples', hostToken: 't' });
    },
    join: (code) => {
      if (code !== 'mighty-apples') return Promise.reject(new RelayError('not_found'));
      return Promise.resolve({ slot: 1, offer, guestToken: 'g' });
    },
    sendAnswer: (_c, _g, a) => {
      answer = a;
      notify?.();
      return Promise.resolve();
    },
    waitForAnswers: async () => {
      if (!answer) await new Promise<void>((r) => (notify = r));
      return { answers: [{ slot: 1, answer }], next: 1 };
    },
    closeRoom: () => undefined,
    cancel: () => undefined,
  };
}

/** Two links joined to each other once the host has the answer. */
function fakeLinks() {
  const ends: Partial<Record<LinkRole, { handlers: LinkHandlers; open: boolean }>> = {};
  const make = (role: LinkRole, handlers: LinkHandlers): Link => {
    const me = { handlers, open: false };
    ends[role] = me;
    const other = () => ends[role === 'host' ? 'join' : 'host']!;
    const link: Link = {
      role,
      status: 'idle',
      createOffer: () => Promise.resolve('offer'),
      acceptAnswer: () => {
        for (const e of [ends.host!, ends.join!]) {
          e.open = true;
          e.handlers.status?.('connected', '');
        }
        return Promise.resolve();
      },
      acceptOffer: () => Promise.resolve('answer'),
      answerDelivered: () => undefined,
      send: (data) => (other().open ? (other().handlers.message?.(data), true) : false),
      close: () => undefined,
    };
    return link;
  };
  return make;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Duel', () => {
  it('connects a host and a joiner by code and carries messages both ways', async () => {
    const relay = fakeRelay();
    const make = fakeLinks();
    const hostLog: string[] = [];
    const joinLog: string[] = [];
    const got: Message[] = [];
    let code = '';
    const host = new Duel(
      {
        phase: (p: DuelPhase, _t: string, c?: string) => {
          hostLog.push(p);
          if (c) code = c;
        },
        message: (m) => got.push(m),
        closed: () => undefined,
      },
      relay,
      make,
    );
    const joinGot: Message[] = [];
    const guest = new Duel(
      { phase: (p) => joinLog.push(p), message: (m) => joinGot.push(m), closed: () => undefined },
      relay,
      make,
    );
    void host.host();
    await tick();
    expect(code).toBe('mighty-apples');
    await guest.join('Mighty Apples');
    await tick();
    expect(hostLog).toContain('waiting');
    expect(hostLog.at(-1)).toBe('connected');
    expect(joinLog.at(-1)).toBe('connected');
    expect(guest.send({ t: 'hi', v: 1, race: 'swarm' })).toBe(true);
    expect(got).toEqual([{ t: 'hi', v: 1, race: 'swarm' }]);
    expect(host.send({ t: 'sum', n: 40, h: 5 })).toBe(true);
    expect(joinGot).toEqual([{ t: 'sum', n: 40, h: 5 }]);
  });

  it('says so when the code is not a code, or no game has it', async () => {
    const texts: string[] = [];
    const d = new Duel(
      { phase: (p, t) => texts.push(`${p}:${t}`), message: () => undefined, closed: () => undefined },
      fakeRelay(),
      fakeLinks(),
    );
    await d.join('banana');
    await d.join('quick-foxes');
    expect(texts[0]).toMatch(/^failed:That is not a game code/);
    expect(texts.at(-1)).toMatch(/^failed:/);
  });
});
