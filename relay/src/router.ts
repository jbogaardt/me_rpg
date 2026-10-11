import { isPayload, MAX_PAYLOAD_CHARS, MAX_WAIT_S, type CreateRoomResponse } from '../../src/net/relayApi';
import { normalizeCode, randomCode } from '../../src/net/roomCode';
import { fail, json } from './room';

// The relay's public face: CORS, abuse limits, and picking a game code, then handing each request to that code's
// room (a Durable Object in production, an in-memory object in tests). See src/net/relayApi.ts for the API.

export interface RoomStub {
  fetch(request: Request): Promise<Response>;
}

export type Bucket = 'create' | 'join';

/** Requests per window, per client address. Joins are limited harder because wrong guesses are the way in. */
export const LIMITS: Record<Bucket, { max: number; windowMs: number }> = {
  create: { max: 10, windowMs: 60_000 },
  join: { max: 20, windowMs: 60_000 },
};

const CODE_ATTEMPTS = 12; // a taken code is just retried; with a handful of live rooms one try nearly always works
const MAX_BODY_CHARS = MAX_PAYLOAD_CHARS + 200;

export interface RelayDeps {
  room(code: string): RoomStub;
  /** True if this client may make another `bucket` request right now (and counts it). */
  allow(client: string, bucket: Bucket): Promise<boolean>;
  /** Uniform integer in [0, n). */
  randomInt(n: number): number;
  /** Origins allowed to call the API from a browser (exact match); localhost is always allowed for development. */
  allowedOrigins: readonly string[];
}

export function originAllowed(origin: string, allowed: readonly string[]): boolean {
  if (allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('vary', 'origin');
  return new Response(response.body, { status: response.status, headers });
}

const ROOMS = /^\/v1\/rooms(?:\/([^/]+)(?:\/(join|answer))?)?\/?$/;

export async function handleRequest(req: Request, deps: RelayDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  if (origin && !originAllowed(origin, deps.allowedOrigins)) return fail(403, 'origin');

  if (req.method === 'OPTIONS') {
    return withCors(
      new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
        },
      }),
      origin,
    );
  }

  try {
    return withCors(await route(req, deps), origin);
  } catch {
    return withCors(fail(500, 'server'), origin);
  }
}

async function route(req: Request, deps: RelayDeps): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/' || url.pathname === '/health') return new Response('me_rpg relay ok\n');

  const match = ROOMS.exec(url.pathname);
  if (!match) return fail(404, 'not_found');
  const [, rawCode, action] = match;
  const client = req.headers.get('cf-connecting-ip') ?? 'unknown';

  if (!rawCode) return req.method === 'POST' ? createRoom(req, deps, client) : fail(405, 'bad_request');

  // Anything that isn't a code the relay could have issued is turned away before it can touch storage.
  const code = normalizeCode(safeDecode(rawCode));
  if (!code) return fail(404, 'not_found');
  const room = deps.room(code);

  if (action === 'join' && req.method === 'POST') {
    if (!(await deps.allow(client, 'join'))) return fail(429, 'rate_limited');
    return room.fetch(forward(req, '/join'));
  }
  if (action === 'answer' && req.method === 'POST') {
    const body = await boundedBody(req);
    if (body === null) return fail(413, 'too_large');
    return room.fetch(forward(req, '/answer', body));
  }
  if (action === 'answer' && req.method === 'GET') {
    const wait = Math.min(Number(url.searchParams.get('wait') ?? 0), MAX_WAIT_S);
    return room.fetch(forward(req, `/answer?wait=${Number.isFinite(wait) ? wait : 0}`));
  }
  if (!action && req.method === 'DELETE') return room.fetch(forward(req, '/'));
  return fail(405, 'bad_request');
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return '';
  }
}

/** The request body as text, or null if it is too big to be a legitimate offer/answer. */
async function boundedBody(req: Request): Promise<string | null> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_CHARS * 4) return null; // bytes vs chars: generous, the real check is below
  const text = await req.text();
  return text.length > MAX_BODY_CHARS ? null : text;
}

/** A request for the room object itself (an internal address; only the path and body matter). */
function forward(req: Request, path: string, body?: string): Request {
  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://room.internal${path}`, { method: req.method, headers, body });
}

function offerIn(body: string): unknown {
  try {
    return (JSON.parse(body) as { offer?: unknown } | null)?.offer;
  } catch {
    return undefined;
  }
}

/** Host: pick a free code and store the offer under it. */
async function createRoom(req: Request, deps: RelayDeps, client: string): Promise<Response> {
  if (!(await deps.allow(client, 'create'))) return fail(429, 'rate_limited');
  const body = await boundedBody(req);
  if (body === null) return fail(413, 'too_large');
  if (!isPayload(offerIn(body))) return fail(400, 'bad_request'); // garbage never reaches a room

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = randomCode((n) => deps.randomInt(n));
    const response = await deps.room(code).fetch(forward(req, '/create', body));
    if (response.status === 409) continue; // that code is in use: try another
    if (response.status !== 201) return response; // e.g. a malformed offer
    const created = JSON.parse(await response.text()) as Omit<CreateRoomResponse, 'code'>;
    return json(201, { code, ...created });
  }
  return fail(503, 'server');
}
