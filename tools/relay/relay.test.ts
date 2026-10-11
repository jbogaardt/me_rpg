import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../../relay/src/router';
import { CLAIM_TTL_MS, MAX_GUESTS, MAX_PAYLOAD_CHARS, MAX_WAIT_S, ROOM_TTL_MS } from '../../src/net/relayApi';
import { createMemoryRelay, type MemoryRelay } from './memory';

const offer = (n: number) => `zOFFER${n}-abc_123`;
const answer = (n: number) => `zANSWER${n}-def_456`;
const OFFERS = [offer(1), offer(2), offer(3)];
const GAME_ORIGIN = 'https://game.example';

interface Reply {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

async function call(
  relay: MemoryRelay,
  method: string,
  path: string,
  options: { body?: unknown; token?: string; origin?: string; ip?: string; raw?: string } = {},
): Promise<Reply> {
  const headers = new Headers({ 'cf-connecting-ip': options.ip ?? '10.0.0.1' });
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.origin) headers.set('origin', options.origin);
  const hasBody = options.body !== undefined || options.raw !== undefined;
  if (hasBody) headers.set('content-type', 'application/json');
  const response = await relay.handle(
    new Request(`https://relay.test${path}`, {
      method,
      headers,
      body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text.startsWith('{') ? (JSON.parse(text) as Reply['body']) : {},
    headers: response.headers,
  };
}

const create = (relay: MemoryRelay, extra: Parameters<typeof call>[3] = {}, offers: string[] = OFFERS) =>
  call(relay, 'POST', '/v2/rooms', { body: { offers }, ...extra });

/** A room with offers in it; returns the code and the host's token. */
async function open(relay: MemoryRelay, offers: string[] = OFFERS) {
  const reply = await create(relay, {}, offers);
  expect(reply.status).toBe(201);
  return { code: reply.body.code as string, hostToken: reply.body.hostToken as string };
}

const join = (relay: MemoryRelay, code: string, ip?: string) => call(relay, 'POST', `/v2/rooms/${code}/join`, { ip });
const answers = (relay: MemoryRelay, code: string, token: string, after = 0, wait = 0) =>
  call(relay, 'GET', `/v2/rooms/${code}/answers?after=${after}&wait=${wait}`, { token });
const send = (relay: MemoryRelay, code: string, guestToken: string, text: string) =>
  call(relay, 'POST', `/v2/rooms/${code}/answer`, { body: { guestToken, answer: text } });

afterEach(() => vi.useRealTimers());

describe('a game from start to finish', () => {
  it('hands each friend their own seat and offer, and each answer back to the host', async () => {
    const relay = createMemoryRelay();
    const created = await create(relay);
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^[a-z]+-[a-z]+$/);
    expect(created.body.expiresInS).toBe(ROOM_TTL_MS / 1000);
    expect(created.body.seats).toBe(3);
    const { code, hostToken } = created.body as { code: string; hostToken: string };

    const tokens: string[] = [];
    for (const slot of [1, 2, 3]) {
      const joined = await join(relay, code);
      expect(joined.status).toBe(200);
      expect(joined.body.slot).toBe(slot);
      expect(joined.body.offer).toBe(offer(slot)); // seat n gets offer n: an offer fits exactly one connection
      tokens.push(joined.body.guestToken as string);
    }
    expect((await join(relay, code)).status).toBe(404); // full

    for (const [i, token] of tokens.entries()) expect((await send(relay, code, token, answer(i + 1))).status).toBe(204);

    const got = await answers(relay, code, hostToken);
    expect(got.status).toBe(200);
    expect(got.body.answers).toEqual([
      { slot: 1, answer: answer(1) },
      { slot: 2, answer: answer(2) },
      { slot: 3, answer: answer(3) },
    ]);
    expect(got.body.next).toBe(3);
  });

  it('works for a smaller game: only as many seats as offers', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay, [offer(1)]);
    expect((await join(relay, code)).body.slot).toBe(1);
    expect((await join(relay, code)).status).toBe(404);
  });

  it('accepts the code however a person typed it', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    const [adjective, noun] = code.split('-');
    const typed = encodeURIComponent(`  ${adjective?.toUpperCase()} ${noun}  `);
    expect((await call(relay, 'POST', `/v2/rooms/${typed}/join`)).status).toBe(200);
  });

  it('gives the host only what is new, using the cursor, so nothing repeats or is missed', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const first = (await join(relay, code)).body.guestToken as string;
    await send(relay, code, first, answer(1));

    const a = await answers(relay, code, hostToken, 0);
    expect(a.body.answers).toEqual([{ slot: 1, answer: answer(1) }]);
    expect(a.body.next).toBe(1);

    expect((await answers(relay, code, hostToken, 1)).body.answers).toEqual([]); // nothing new

    const second = (await join(relay, code)).body.guestToken as string;
    await send(relay, code, second, answer(2));
    const b = await answers(relay, code, hostToken, 1);
    expect(b.body.answers).toEqual([{ slot: 2, answer: answer(2) }]);
    expect(b.body.next).toBe(2);
    // Asking again from the start still returns everything (a host that lost its place can recover).
    expect((await answers(relay, code, hostToken, 0)).body.answers).toHaveLength(2);
  });

  it('lets the host wait for answers and wakes the moment one arrives', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = answers(relay, code, hostToken, 0, 20);
    await Promise.resolve(); // the host is now parked on the relay

    const { guestToken } = (await join(relay, code)).body as { guestToken: string };
    await send(relay, code, guestToken, answer(1));

    const got = await waiting; // resolves now, not after 20 seconds
    expect(got.body.answers).toEqual([{ slot: 1, answer: answer(1) }]);
  });

  it('answers a waiting host with an empty list when the wait runs out, so it can ask again', async () => {
    vi.useFakeTimers();
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = answers(relay, code, hostToken, 0, 2);
    await vi.advanceTimersByTimeAsync(2000);
    const got = await waiting;
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ answers: [], next: 0 });
    expect((await join(relay, code)).status).toBe(200); // the room is still there
  });

  it('does not wait at all unless asked to', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    expect((await answers(relay, code, hostToken)).body.answers).toEqual([]);
  });

  it('lets the host cancel, and the code stops working, waking a waiting host with "gone"', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = answers(relay, code, hostToken, 0, 20);
    await Promise.resolve();
    expect((await call(relay, 'DELETE', `/v2/rooms/${code}`, { token: hostToken })).status).toBe(204);
    expect((await waiting).status).toBe(404);
    expect((await join(relay, code)).status).toBe(404);
  });
});

describe('seats', () => {
  it('only accepts an answer from whoever holds that seat, and only once', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    expect((await send(relay, code, 'x', answer(1))).status).toBe(403); // nobody has joined
    const mine = (await join(relay, code)).body.guestToken as string;
    const theirs = (await join(relay, code)).body.guestToken as string;
    expect((await send(relay, code, 'wrong', answer(1))).status).toBe(403);
    expect((await send(relay, code, mine, answer(1))).status).toBe(204);
    expect((await send(relay, code, mine, 'zOTHER')).status).toBe(409);
    expect((await send(relay, code, theirs, answer(2))).status).toBe(204);
  });

  it('offers a seat to someone else if its friend never answers in time', async () => {
    let now = 1_000_000;
    const relay = createMemoryRelay({ now: () => now });
    const { code, hostToken } = await open(relay, [offer(1)]);
    const first = (await join(relay, code)).body.guestToken as string;
    expect((await join(relay, code)).status).toBe(404); // taken, and still within its time
    now += CLAIM_TTL_MS + 1;
    const second = await join(relay, code);
    expect(second.status).toBe(200);
    expect(second.body.slot).toBe(1);
    expect(second.body.offer).toBe(offer(1)); // the offer was never used, so it can be used again
    // The first friend's token no longer works; the new one does.
    expect((await send(relay, code, first, answer(1))).status).toBe(403);
    expect((await send(relay, code, second.body.guestToken as string, answer(2))).status).toBe(204);
    expect((await answers(relay, code, hostToken)).body.answers).toEqual([{ slot: 1, answer: answer(2) }]);
  });

  it('keeps a seat for a friend who answered, however long the connection takes', async () => {
    let now = 0;
    const relay = createMemoryRelay({ now: () => now });
    const { code } = await open(relay, [offer(1)]);
    const token = (await join(relay, code)).body.guestToken as string;
    await send(relay, code, token, answer(1));
    now += CLAIM_TTL_MS * 3;
    expect((await join(relay, code)).status).toBe(404);
  });

  it('lets the host reopen a seat with a fresh offer once its friend has left', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay, [offer(1)]);
    const token = (await join(relay, code)).body.guestToken as string;
    await send(relay, code, token, answer(1));
    expect((await join(relay, code)).status).toBe(404);

    const put = await call(relay, 'PUT', `/v2/rooms/${code}/seats/1`, { token: hostToken, body: { offer: offer(9) } });
    expect(put.status).toBe(204);
    const again = await join(relay, code);
    expect(again.status).toBe(200);
    expect(again.body.offer).toBe(offer(9));
    expect(again.body.slot).toBe(1);
    expect((await send(relay, code, token, answer(2))).status).toBe(403); // the old friend's token is dead
  });

  it('only lets the host reopen seats, only real ones, and not once closed', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay, [offer(1)]);
    const put = (slot: number, token: string, body: unknown = { offer: offer(9) }) =>
      call(relay, 'PUT', `/v2/rooms/${code}/seats/${slot}`, { token, body });
    expect((await put(1, 'guess')).status).toBe(403);
    expect((await put(2, hostToken)).status).toBe(404); // there is no seat 2
    expect((await put(1, hostToken, { offer: 'has spaces' })).status).toBe(400);
    await call(relay, 'POST', `/v2/rooms/${code}/close`, { token: hostToken });
    expect((await put(1, hostToken)).status).toBe(409);
  });
});

describe('who may do what', () => {
  it('only gives the answers (or accepts a cancel, close or reopen) to the host', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    expect((await call(relay, 'GET', `/v2/rooms/${code}/answers`)).status).toBe(403);
    expect((await answers(relay, code, 'guess')).status).toBe(403);
    expect((await call(relay, 'DELETE', `/v2/rooms/${code}`, { token: 'guess' })).status).toBe(403);
    expect((await call(relay, 'POST', `/v2/rooms/${code}/close`, { token: 'guess' })).status).toBe(403);
    // The room survived all of that.
    expect((await answers(relay, code, hostToken)).status).toBe(200);
    expect((await join(relay, code)).status).toBe(200);
  });

  it('does not let a new game take over a live code', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    const clash = await relay.deps
      .room(code)
      .fetch(new Request('https://room.internal/create', { method: 'POST', body: JSON.stringify({ offers: OFFERS }) }));
    expect(clash.status).toBe(409);
  });

  it('picks another code when the first one drawn is taken', async () => {
    const relay = createMemoryRelay();
    relay.deps.randomInt = () => 0;
    const first = await open(relay);
    const draws = [0, 0, 1, 1];
    relay.deps.randomInt = () => draws.shift() ?? 0;
    const second = await open(relay);
    expect(second.code).not.toBe(first.code);
    expect(relay.codes().sort()).toEqual([first.code, second.code].sort());
  });
});

describe('closing the game to new players', () => {
  it('stops new joins but still takes the answer of a friend who had already taken a seat', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const early = (await join(relay, code)).body.guestToken as string;
    expect((await call(relay, 'POST', `/v2/rooms/${code}/close`, { token: hostToken })).status).toBe(204);

    expect((await join(relay, code)).status).toBe(404); // the code no longer works for newcomers
    expect((await send(relay, code, early, answer(1))).status).toBe(204); // but the early friend can finish
    expect((await answers(relay, code, hostToken)).body.answers).toEqual([{ slot: 1, answer: answer(1) }]);
  });

  it('forgets the room shortly after closing', async () => {
    let now = 0;
    const relay = createMemoryRelay({ now: () => now });
    const { code, hostToken } = await open(relay);
    await call(relay, 'POST', `/v2/rooms/${code}/close`, { token: hostToken });
    now += CLAIM_TTL_MS + 1;
    expect((await answers(relay, code, hostToken)).status).toBe(404);
  });
});

describe('bad input', () => {
  it('rejects offers that are missing, malformed, or the wrong number', async () => {
    const relay = createMemoryRelay();
    for (const offers of [
      undefined,
      null,
      'zX',
      [],
      ['has spaces'],
      ['zA', 42],
      ['zA', ''],
      Array.from({ length: MAX_GUESTS + 1 }, (_, i) => offer(i)),
    ]) {
      expect((await call(relay, 'POST', '/v2/rooms', { body: { offers } })).status).toBe(400);
    }
    expect((await call(relay, 'POST', '/v2/rooms', { body: { offer: 'zA' } })).status).toBe(400); // the old shape
    expect((await call(relay, 'POST', '/v2/rooms', { raw: 'not json' })).status).toBe(400);
    expect(relay.codes()).toEqual([]);
  });

  it('rejects oversized bodies', async () => {
    const relay = createMemoryRelay();
    const huge = 'a'.repeat(MAX_PAYLOAD_CHARS * MAX_GUESTS + 1000);
    expect((await create(relay, {}, [huge])).status).toBe(413);
    // A full set of maximum-size offers is fine.
    const big = 'a'.repeat(MAX_PAYLOAD_CHARS);
    expect((await create(relay, {}, [big, big, big])).status).toBe(201);
    // One that is a character too long is not.
    expect((await create(relay, {}, [big + 'a'])).status).toBe(400);
  });

  it('turns away codes the relay could never have issued, without creating anything', async () => {
    const relay = createMemoryRelay();
    for (const code of ['nonsense', 'mighty', 'mighty-apples-extra', 'a-b', '%E0%A4%A', '../etc', 'able-able']) {
      expect((await call(relay, 'POST', `/v2/rooms/${code}/join`)).status).toBe(404);
    }
    expect(relay.codes()).toEqual([]);
  });

  it('answers unknown routes, old versions and wrong methods without crashing', async () => {
    const relay = createMemoryRelay();
    expect((await call(relay, 'GET', '/nope')).status).toBe(404);
    expect((await call(relay, 'POST', '/v1/rooms', { body: { offer: 'zA' } })).status).toBe(404); // the old API
    expect((await call(relay, 'GET', '/v2/rooms')).status).toBe(405);
    expect((await call(relay, 'GET', '/health')).status).toBe(200);
    const { code } = await open(relay);
    expect((await call(relay, 'PUT', `/v2/rooms/${code}/seats/0`, { body: { offer: 'zA' } })).status).toBe(404);
    expect((await call(relay, 'PATCH', `/v2/rooms/${code}`)).status).toBe(405);
  });

  it('survives a bad cursor or wait', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    for (const query of ['after=abc&wait=xyz', 'after=-5&wait=-1', 'after=1.5']) {
      const got = await call(relay, 'GET', `/v2/rooms/${code}/answers?${query}`, { token: hostToken });
      expect(got.status).toBe(200);
    }
  });

  it('caps how long a host can be made to wait', async () => {
    vi.useFakeTimers();
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = call(relay, 'GET', `/v2/rooms/${code}/answers?wait=9999999`, { token: hostToken });
    await vi.advanceTimersByTimeAsync(MAX_WAIT_S * 1000);
    expect((await waiting).status).toBe(200);
  });
});

describe('expiry', () => {
  it('forgets a room after its time is up, even if nobody asks', async () => {
    let now = 1_000_000;
    const relay = createMemoryRelay({ now: () => now });
    const { code, hostToken } = await open(relay);
    now += ROOM_TTL_MS - 1;
    expect((await answers(relay, code, hostToken)).status).toBe(200);
    now += 2;
    expect((await join(relay, code)).status).toBe(404);
    expect((await answers(relay, code, hostToken)).status).toBe(404);
  });

  it('frees the code for a new game once it has expired', async () => {
    let now = 0;
    const relay = createMemoryRelay({ now: () => now });
    relay.deps.randomInt = () => 3;
    const first = await open(relay);
    now += ROOM_TTL_MS + 1;
    const second = await open(relay);
    expect(second.code).toBe(first.code);
  });
});

describe('rate limits', () => {
  it('limits game creation per client, and resets after the window', async () => {
    let now = 0;
    const relay = createMemoryRelay({ now: () => now });
    for (let i = 0; i < LIMITS.create.max; i++) expect((await create(relay)).status).toBe(201);
    expect((await create(relay)).status).toBe(429);
    expect((await create(relay, { ip: '10.0.0.2' })).status).toBe(201); // someone else is unaffected
    now += LIMITS.create.windowMs;
    expect((await create(relay)).status).toBe(201);
  });

  it('limits guessing: wrong codes count against the client', async () => {
    const relay = createMemoryRelay();
    for (let i = 0; i < LIMITS.join.max; i++) {
      expect((await join(relay, 'able-acorns')).status).toBe(404);
    }
    expect((await join(relay, 'able-acorns')).status).toBe(429);
  });

  it('does not limit the host collecting answers', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    for (let i = 0; i < 50; i++) expect((await answers(relay, code, hostToken)).status).toBe(200);
  });
});

describe('browser access (CORS)', () => {
  it('answers preflight requests for the game origin', async () => {
    const relay = createMemoryRelay({ allowedOrigins: [GAME_ORIGIN] });
    const reply = await call(relay, 'OPTIONS', '/v2/rooms', { origin: GAME_ORIGIN });
    expect(reply.status).toBe(204);
    expect(reply.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN);
    expect(reply.headers.get('access-control-allow-headers')).toMatch(/authorization/);
    expect(reply.headers.get('access-control-allow-methods')).toMatch(/DELETE/);
    expect(reply.headers.get('access-control-allow-methods')).toMatch(/PUT/); // seats are reopened with PUT
  });

  it('marks real responses for the game origin, including errors', async () => {
    const relay = createMemoryRelay({ allowedOrigins: [GAME_ORIGIN] });
    const ok = await create(relay, { origin: GAME_ORIGIN });
    expect(ok.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN);
    const missing = await call(relay, 'POST', '/v2/rooms/able-acorns/join', { origin: GAME_ORIGIN });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN);
  });

  it('refuses other websites, but allows localhost for development and non-browser callers', async () => {
    const relay = createMemoryRelay({ allowedOrigins: [GAME_ORIGIN] });
    expect((await create(relay, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(relay, 'OPTIONS', '/v2/rooms', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await create(relay, { origin: 'http://localhost:4173' })).status).toBe(201);
    expect((await create(relay, { origin: 'http://127.0.0.1:5173' })).status).toBe(201);
    expect((await create(relay)).status).toBe(201); // no Origin header: curl, tests
  });
});
