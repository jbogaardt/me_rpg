import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../../relay/src/router';
import { MAX_PAYLOAD_CHARS, ROOM_TTL_MS } from '../../src/net/relayApi';
import { createMemoryRelay, type MemoryRelay } from './memory';

const OFFER = 'zOFFERabc-_123';
const ANSWER = 'zANSWERdef-_456';
const GAME_ORIGIN = 'https://game.example';

interface Reply {
  status: number;
  body: Record<string, string | number | boolean | undefined>;
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

const create = (relay: MemoryRelay, extra: Parameters<typeof call>[3] = {}) =>
  call(relay, 'POST', '/v1/rooms', { body: { offer: OFFER }, ...extra });

/** A room with an offer in it; returns the code and the host's token. */
async function open(relay: MemoryRelay) {
  const reply = await create(relay);
  expect(reply.status).toBe(201);
  return { code: reply.body.code as string, hostToken: reply.body.hostToken as string };
}

afterEach(() => vi.useRealTimers());

describe('a game from start to finish', () => {
  it('hands the offer to the friend and the answer back to the host, then forgets the room', async () => {
    const relay = createMemoryRelay();
    const created = await create(relay);
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^[a-z]+-[a-z]+$/);
    expect(created.body.expiresInS).toBe(ROOM_TTL_MS / 1000);
    const { code, hostToken } = created.body as { code: string; hostToken: string };

    const joined = await call(relay, 'POST', `/v1/rooms/${code}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body.offer).toBe(OFFER);
    const guestToken = joined.body.guestToken as string;

    const sent = await call(relay, 'POST', `/v1/rooms/${code}/answer`, { body: { guestToken, answer: ANSWER } });
    expect(sent.status).toBe(204);

    const got = await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken });
    expect(got.status).toBe(200);
    expect(got.body.answer).toBe(ANSWER);

    // Single use: nothing is left to join, collect or cancel.
    expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(404);
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken })).status).toBe(404);
  });

  it('accepts the code however a person typed it', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    const [adjective, noun] = code.split('-');
    const typed = encodeURIComponent(`  ${adjective?.toUpperCase()} ${noun}  `);
    expect((await call(relay, 'POST', `/v1/rooms/${typed}/join`)).status).toBe(200);
  });

  it('lets the host wait for the answer and wakes the moment it arrives', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = call(relay, 'GET', `/v1/rooms/${code}/answer?wait=20`, { token: hostToken });
    await Promise.resolve(); // the host is now parked on the relay

    const { guestToken } = (await call(relay, 'POST', `/v1/rooms/${code}/join`)).body as { guestToken: string };
    await call(relay, 'POST', `/v1/rooms/${code}/answer`, { body: { guestToken, answer: ANSWER } });

    const got = await waiting; // resolves now, not after 20 seconds
    expect(got.status).toBe(200);
    expect(got.body.answer).toBe(ANSWER);
  });

  it('tells a waiting host "not yet" after the wait, so it can ask again', async () => {
    vi.useFakeTimers();
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = call(relay, 'GET', `/v1/rooms/${code}/answer?wait=2`, { token: hostToken });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await waiting).status).toBe(204);
    // ...and the room is still there.
    expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(200);
  });

  it('does not wait at all unless asked to', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken })).status).toBe(204);
  });

  it('lets the host cancel, and the code stops working', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    expect((await call(relay, 'DELETE', `/v1/rooms/${code}`, { token: hostToken })).status).toBe(204);
    expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(404);
  });

  it('wakes a waiting host with "gone" when the room is cancelled', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    const waiting = call(relay, 'GET', `/v1/rooms/${code}/answer?wait=20`, { token: hostToken });
    await Promise.resolve();
    await call(relay, 'DELETE', `/v1/rooms/${code}`, { token: hostToken });
    expect((await waiting).status).toBe(404);
  });
});

describe('who may do what', () => {
  it('lets only one friend take the offer', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(200);
    expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(404);
  });

  it('only accepts an answer from whoever took the offer, and only once', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    // Nobody has joined yet: there is nothing to answer.
    expect(
      (await call(relay, 'POST', `/v1/rooms/${code}/answer`, { body: { guestToken: 'x', answer: ANSWER } })).status,
    ).toBe(404);

    const { guestToken } = (await call(relay, 'POST', `/v1/rooms/${code}/join`)).body as { guestToken: string };
    expect(
      (await call(relay, 'POST', `/v1/rooms/${code}/answer`, { body: { guestToken: 'wrong', answer: ANSWER } })).status,
    ).toBe(403);
    expect(
      (await call(relay, 'POST', `/v1/rooms/${code}/answer`, { body: { guestToken, answer: ANSWER } })).status,
    ).toBe(204);
    expect(
      (await call(relay, 'POST', `/v1/rooms/${code}/answer`, { body: { guestToken, answer: 'zOTHER' } })).status,
    ).toBe(409);
  });

  it('only gives the answer (or accepts a cancel) to the host', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`)).status).toBe(403);
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: 'guess' })).status).toBe(403);
    expect((await call(relay, 'DELETE', `/v1/rooms/${code}`, { token: 'guess' })).status).toBe(403);
    // The room survived all of that.
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken })).status).toBe(204);
  });

  it('does not let a new game take over a live code', async () => {
    const relay = createMemoryRelay();
    const { code } = await open(relay);
    // Force the next two draws to be the same code, then a different one.
    const draws = [0, 0, 5, 5];
    relay.deps.randomInt = () => draws.shift() ?? 0;
    const room = relay.deps.room(code);
    const clash = await room.fetch(
      new Request('https://room.internal/create', { method: 'POST', body: JSON.stringify({ offer: OFFER }) }),
    );
    expect(clash.status).toBe(409);
  });

  it('picks another code when the first one drawn is taken', async () => {
    const relay = createMemoryRelay();
    relay.deps.randomInt = () => 0;
    const first = await open(relay); // always "able-acorns"
    const draws = [0, 0, 1, 1];
    relay.deps.randomInt = () => draws.shift() ?? 0;
    const second = await open(relay);
    expect(second.code).not.toBe(first.code);
    expect(relay.codes().sort()).toEqual([first.code, second.code].sort());
  });
});

describe('bad input', () => {
  it('rejects an offer that is not a code', async () => {
    const relay = createMemoryRelay();
    for (const offer of ['', 'has spaces', '<script>', 123, null, undefined]) {
      expect((await call(relay, 'POST', '/v1/rooms', { body: { offer } })).status).toBe(400);
    }
    expect((await call(relay, 'POST', '/v1/rooms', { raw: 'not json' })).status).toBe(400);
    expect(relay.codes()).toEqual([]);
  });

  it('rejects oversized bodies', async () => {
    const relay = createMemoryRelay();
    const huge = 'a'.repeat(MAX_PAYLOAD_CHARS + 1000);
    expect((await call(relay, 'POST', '/v1/rooms', { body: { offer: huge } })).status).toBe(413);
    // Just inside the limit is fine.
    expect((await call(relay, 'POST', '/v1/rooms', { body: { offer: 'a'.repeat(MAX_PAYLOAD_CHARS) } })).status).toBe(
      201,
    );
  });

  it('turns away codes the relay could never have issued, without creating anything', async () => {
    const relay = createMemoryRelay();
    for (const code of ['nonsense', 'mighty', 'mighty-apples-extra', 'a-b', '%E0%A4%A', '../etc', 'able-able']) {
      expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(404);
    }
    expect(relay.codes()).toEqual([]);
  });

  it('answers unknown routes and wrong methods without crashing', async () => {
    const relay = createMemoryRelay();
    expect((await call(relay, 'GET', '/nope')).status).toBe(404);
    expect((await call(relay, 'GET', '/v1/rooms')).status).toBe(405);
    expect((await call(relay, 'GET', '/health')).status).toBe(200);
  });
});

describe('expiry', () => {
  it('forgets a room after its time is up, even if nobody asks', async () => {
    let now = 1_000_000;
    const relay = createMemoryRelay({ now: () => now });
    const { code, hostToken } = await open(relay);
    now += ROOM_TTL_MS - 1;
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken })).status).toBe(204);
    now += 2;
    expect((await call(relay, 'POST', `/v1/rooms/${code}/join`)).status).toBe(404);
    expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken })).status).toBe(404);
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
      expect((await call(relay, 'POST', '/v1/rooms/able-acorns/join')).status).toBe(404);
    }
    expect((await call(relay, 'POST', '/v1/rooms/able-acorns/join')).status).toBe(429);
  });

  it('does not limit the host waiting for an answer', async () => {
    const relay = createMemoryRelay();
    const { code, hostToken } = await open(relay);
    for (let i = 0; i < 50; i++) {
      expect((await call(relay, 'GET', `/v1/rooms/${code}/answer`, { token: hostToken })).status).toBe(204);
    }
  });
});

describe('browser access (CORS)', () => {
  it('answers preflight requests for the game origin', async () => {
    const relay = createMemoryRelay({ allowedOrigins: [GAME_ORIGIN] });
    const reply = await call(relay, 'OPTIONS', '/v1/rooms', { origin: GAME_ORIGIN });
    expect(reply.status).toBe(204);
    expect(reply.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN);
    expect(reply.headers.get('access-control-allow-headers')).toMatch(/authorization/);
    expect(reply.headers.get('access-control-allow-methods')).toMatch(/DELETE/);
  });

  it('marks real responses for the game origin, including errors', async () => {
    const relay = createMemoryRelay({ allowedOrigins: [GAME_ORIGIN] });
    const ok = await create(relay, { origin: GAME_ORIGIN });
    expect(ok.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN);
    const missing = await call(relay, 'POST', '/v1/rooms/able-acorns/join', { origin: GAME_ORIGIN });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN);
  });

  it('refuses other websites, but allows localhost for development and non-browser callers', async () => {
    const relay = createMemoryRelay({ allowedOrigins: [GAME_ORIGIN] });
    expect((await create(relay, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(relay, 'OPTIONS', '/v1/rooms', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await create(relay, { origin: 'http://localhost:4173' })).status).toBe(201);
    expect((await create(relay, { origin: 'http://127.0.0.1:5173' })).status).toBe(201);
    expect((await create(relay)).status).toBe(201); // no Origin header: curl, tests
  });
});
