import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayClient, RelayError } from '../../src/net/relayClient';
import { createMemoryRelay } from './memory';

// The real client talking to the real relay code (in memory) over a fetch that hands requests straight to it.

const OFFERS = ['zOFFER1-abc_123', 'zOFFER2-abc_123', 'zOFFER3-abc_123'];
const ANSWER = 'zANSWER-def_456';

function setup(overrides: { fetch?: typeof fetch } = {}) {
  const relay = createMemoryRelay();
  const fetchFn: typeof fetch =
    overrides.fetch ??
    ((input, init) =>
      new Promise<Response>((resolve, reject) => {
        // Like a real fetch: aborting rejects the call even though the server is still holding the request.
        const signal = init?.signal;
        if (signal?.aborted) return reject(signal.reason as Error);
        signal?.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
        const headers = new Headers(init?.headers);
        headers.set('cf-connecting-ip', '10.0.0.9');
        relay.handle(new Request(input, { ...init, headers, signal: undefined })).then(resolve, reject);
      }));
  return { relay, client: new RelayClient('https://relay.test', fetchFn) };
}

afterEach(() => vi.useRealTimers());

describe('RelayClient', () => {
  it('connects a host and three friends end to end, each on their own seat', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFERS);
    expect(room.code).toMatch(/^[a-z]+-[a-z]+$/);

    const abort = new AbortController();
    const seen: Record<number, string> = {};
    let after = 0;
    const host = (async () => {
      while (Object.keys(seen).length < 3) {
        const got = await client.waitForAnswers(room, after, abort.signal);
        after = got.next;
        for (const { slot, answer } of got.answers) seen[slot] = answer;
      }
    })();

    for (const slot of [1, 2, 3]) {
      const invitation = await client.join(room.code);
      expect(invitation.slot).toBe(slot);
      expect(invitation.offer).toBe(OFFERS[slot - 1]);
      await client.sendAnswer(room.code, invitation.guestToken, `${ANSWER}${slot}`);
    }
    await host;
    expect(seen).toEqual({ 1: `${ANSWER}1`, 2: `${ANSWER}2`, 3: `${ANSWER}3` });
    await expect(client.join(room.code)).rejects.toMatchObject({ kind: 'not_found' }); // full
  });

  it('keeps asking while the host waits, until an answer comes', async () => {
    vi.useFakeTimers();
    const { client, relay } = setup();
    const room = await client.createRoom(OFFERS);
    const seen: string[] = [];
    const counting: typeof fetch = (input, init) => {
      seen.push(new Request(input).url);
      return relay.handle(new Request(input, { ...init, signal: undefined }));
    };
    const host = new RelayClient('https://relay.test', counting);

    // One round of waiting ends empty after the relay's wait runs out...
    const idle = host.waitForAnswers(room, 0, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(await idle).toEqual({ answers: [], next: 0 });

    // ...and the next round, started where the last left off, hears the answer as soon as it is sent.
    const next = host.waitForAnswers(room, 0, new AbortController().signal);
    const invitation = await client.join(room.code);
    await client.sendAnswer(room.code, invitation.guestToken, ANSWER);
    expect(await next).toEqual({ answers: [{ slot: 1, answer: ANSWER }], next: 1 });
    expect(seen.every((url) => url.includes('/answers?after=0&wait='))).toBe(true);
  });

  it('stops waiting when the host cancels, without calling it an error', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFERS);
    const abort = new AbortController();
    const waiting = client.waitForAnswers(room, 0, abort.signal);
    abort.abort(new DOMException('cancelled', 'AbortError'));
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('tells a friend a game code is not open, and a host the code ran out', async () => {
    const { client } = setup();
    await expect(client.join('able-acorns')).rejects.toMatchObject({ kind: 'not_found' });

    const room = await client.createRoom(OFFERS);
    client.cancel(room);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(client.waitForAnswers(room, 0, new AbortController().signal)).rejects.toMatchObject({
      kind: 'expired',
    });
  });

  it('refuses newcomers once the host has closed the game, but a friend already seated can finish', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFERS);
    const early = await client.join(room.code);
    client.closeRoom(room);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(client.join(room.code)).rejects.toMatchObject({ kind: 'not_found' });
    await client.sendAnswer(room.code, early.guestToken, ANSWER);
    const got = await client.waitForAnswers(room, 0, new AbortController().signal);
    expect(got.answers).toEqual([{ slot: 1, answer: ANSWER }]);
  });

  it('lets the host reopen a seat so another friend can take it', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFERS.slice(0, 1));
    const first = await client.join(room.code);
    await client.sendAnswer(room.code, first.guestToken, ANSWER);
    await expect(client.join(room.code)).rejects.toMatchObject({ kind: 'not_found' });

    await client.reopenSeat(room, 1, 'zFRESH-offer_1');
    const second = await client.join(room.code);
    expect(second).toMatchObject({ slot: 1, offer: 'zFRESH-offer_1' });
    await expect(client.reopenSeat(room, 2, 'zX')).rejects.toMatchObject({ kind: 'expired' }); // no seat 2
  });

  it('tells a friend whose seat timed out that it expired', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFERS);
    const invitation = await client.join(room.code);
    await expect(client.sendAnswer(room.code, 'not-the-token', ANSWER)).rejects.toMatchObject({ kind: 'expired' });
    await client.sendAnswer(room.code, invitation.guestToken, ANSWER);
  });

  it('turns a rate limit and a server error into plain messages', async () => {
    const respond = (status: number) => setup({ fetch: () => Promise.resolve(new Response('{}', { status })) }).client;
    await expect(respond(429).createRoom(OFFERS)).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(respond(500).createRoom(OFFERS)).rejects.toMatchObject({ kind: 'server' });
    await expect(respond(403).join('able-acorns')).rejects.toMatchObject({ kind: 'server' });
    await expect(respond(429).createRoom(OFFERS)).rejects.toThrow(/Too many tries/);
  });

  it('reports an unreachable server, and retries a waiting host through a brief drop', async () => {
    const down = setup({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) }).client;
    await expect(down.createRoom(OFFERS)).rejects.toThrow(/Can’t reach the game server/);

    vi.useFakeTimers();
    let calls = 0;
    const flaky: typeof fetch = () => {
      calls++;
      if (calls <= 2) return Promise.reject(new TypeError('network changed'));
      return Promise.resolve(Response.json({ answers: [{ slot: 2, answer: ANSWER }], next: 1 }));
    };
    const host = new RelayClient('https://relay.test', flaky);
    const waiting = host.waitForAnswers({ code: 'able-acorns', hostToken: 't' }, 0, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await waiting).toEqual({ answers: [{ slot: 2, answer: ANSWER }], next: 1 });
    expect(calls).toBe(3);
  });

  it('gives up on a waiting host after a lasting outage', async () => {
    vi.useFakeTimers();
    const host = new RelayClient('https://relay.test', () => Promise.reject(new TypeError('offline')));
    const waiting = host.waitForAnswers({ code: 'able-acorns', hostToken: 't' }, 0, new AbortController().signal);
    const outcome = expect(waiting).rejects.toBeInstanceOf(RelayError);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });

  it('does not trust a malformed reply', async () => {
    const odd = (body: unknown, status = 200) =>
      setup({ fetch: () => Promise.resolve(Response.json(body, { status })) }).client;
    const room = { code: 'able-acorns', hostToken: 't' };
    const stop = new AbortController().signal;
    await expect(odd({ slot: 1, offer: 'has spaces', guestToken: 't' }).join('able-acorns')).rejects.toMatchObject({
      kind: 'server',
    });
    await expect(odd({ slot: 9, offer: 'zA', guestToken: 't' }).join('able-acorns')).rejects.toMatchObject({
      kind: 'server',
    });
    await expect(odd({ nonsense: true }, 201).createRoom(OFFERS)).rejects.toMatchObject({ kind: 'server' });
    await expect(odd({ answers: 'x', next: 0 }).waitForAnswers(room, 0, stop)).rejects.toMatchObject({
      kind: 'server',
    });
    await expect(
      odd({ answers: [{ slot: 7, answer: 'zA' }], next: 1 }).waitForAnswers(room, 0, stop),
    ).rejects.toMatchObject({
      kind: 'server',
    });
    await expect(odd({ answers: [], next: -1 }).waitForAnswers(room, 0, stop)).rejects.toMatchObject({
      kind: 'server',
    });
  });
});
