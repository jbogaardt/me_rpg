import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayClient, RelayError } from '../../src/net/relayClient';
import { createMemoryRelay } from './memory';

// The real client talking to the real relay code (in memory) over a fetch that hands requests straight to it.

const OFFER = 'zOFFER-abc_123';
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
  it('connects a host and a friend end to end', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFER);
    expect(room.code).toMatch(/^[a-z]+-[a-z]+$/);

    const waiting = client.waitForAnswer(room, new AbortController().signal);
    const invitation = await client.join(room.code);
    expect(invitation.offer).toBe(OFFER);
    await client.sendAnswer(room.code, invitation.guestToken, ANSWER);
    expect(await waiting).toBe(ANSWER);
  });

  it('keeps asking while the host waits, until the answer comes', async () => {
    vi.useFakeTimers();
    const { client, relay } = setup();
    const room = await client.createRoom(OFFER);
    const seen: string[] = [];
    const counting: typeof fetch = (input, init) => {
      seen.push(new Request(input).url);
      return relay.handle(new Request(input, { ...init, signal: undefined }));
    };
    const host = new RelayClient('https://relay.test', counting);
    const waiting = host.waitForAnswer(room, new AbortController().signal);

    await vi.advanceTimersByTimeAsync(21_000); // the relay's wait runs out, "not yet" comes back, the host asks again
    expect(seen.length).toBeGreaterThanOrEqual(2);

    const invitation = await client.join(room.code);
    await client.sendAnswer(room.code, invitation.guestToken, ANSWER);
    expect(await waiting).toBe(ANSWER);
  });

  it('stops waiting when the host cancels, without calling it an error', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFER);
    const abort = new AbortController();
    const waiting = client.waitForAnswer(room, abort.signal);
    abort.abort(new DOMException('cancelled', 'AbortError'));
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('tells a friend a game code is not open, and a host the code ran out', async () => {
    const { client } = setup();
    await expect(client.join('able-acorns')).rejects.toMatchObject({ kind: 'not_found' });

    const room = await client.createRoom(OFFER);
    client.cancel(room);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(client.waitForAnswer(room, new AbortController().signal)).rejects.toMatchObject({ kind: 'expired' });
  });

  it('only lets one friend in', async () => {
    const { client } = setup();
    const room = await client.createRoom(OFFER);
    await client.join(room.code);
    await expect(client.join(room.code)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('turns a rate limit and a server error into plain messages', async () => {
    const respond = (status: number) => setup({ fetch: () => Promise.resolve(new Response('{}', { status })) }).client;
    await expect(respond(429).createRoom(OFFER)).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(respond(500).createRoom(OFFER)).rejects.toMatchObject({ kind: 'server' });
    await expect(respond(403).join('able-acorns')).rejects.toMatchObject({ kind: 'server' });
    await expect(respond(429).createRoom(OFFER)).rejects.toThrow(/Too many tries/);
  });

  it('reports an unreachable server, and retries a waiting host through a brief drop', async () => {
    const down = setup({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) }).client;
    await expect(down.createRoom(OFFER)).rejects.toThrow(/Can’t reach the game server/);

    vi.useFakeTimers();
    let calls = 0;
    const flaky: typeof fetch = () => {
      calls++;
      if (calls <= 2) return Promise.reject(new TypeError('network changed'));
      return Promise.resolve(Response.json({ answer: ANSWER }));
    };
    const host = new RelayClient('https://relay.test', flaky);
    const waiting = host.waitForAnswer({ code: 'able-acorns', hostToken: 't' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await waiting).toBe(ANSWER);
    expect(calls).toBe(3);
  });

  it('gives up on a waiting host after a lasting outage', async () => {
    vi.useFakeTimers();
    const host = new RelayClient('https://relay.test', () => Promise.reject(new TypeError('offline')));
    const waiting = host.waitForAnswer({ code: 'able-acorns', hostToken: 't' }, new AbortController().signal);
    const outcome = expect(waiting).rejects.toBeInstanceOf(RelayError);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });

  it('does not trust a malformed reply', async () => {
    const odd = (body: unknown, status = 200) =>
      setup({ fetch: () => Promise.resolve(Response.json(body, { status })) }).client;
    await expect(odd({ offer: 'has spaces', guestToken: 't' }).join('able-acorns')).rejects.toMatchObject({
      kind: 'server',
    });
    await expect(odd({ nonsense: true }, 201).createRoom(OFFER)).rejects.toMatchObject({ kind: 'server' });
  });
});
