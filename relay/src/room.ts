import {
  isPayload,
  MAX_WAIT_S,
  ROOM_TTL_MS,
  type ErrorKind,
  type JoinRoomResponse,
  type WaitAnswerResponse,
} from '../../src/net/relayApi';

// One game code's worth of state and rules. It speaks a tiny internal HTTP dialect (the router forwards to it),
// and is written against a RoomStore so the same code runs inside a Durable Object (index.ts) and in Node (tests
// and the local dev server). Nothing here knows what an offer or answer contains.

export interface RoomRecord {
  offer: string;
  hostToken: string;
  /** Set when a friend has taken the offer; a room can be joined only once. */
  guestToken: string | null;
  answer: string | null;
  expiresAt: number;
}

export interface RoomStore {
  load(): Promise<RoomRecord | null>;
  save(record: RoomRecord): Promise<void>;
  /** Forget the room entirely. */
  clear(): Promise<void>;
  /** Ask for `expire()` to be called at this time. */
  scheduleExpiry(at: number): Promise<void>;
}

export interface RoomDeps {
  now(): number;
  /** A fresh unguessable token. */
  token(): string;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const fail = (status: number, error: ErrorKind): Response => json(status, { error });

/** Equal without leaking, through timing, how much of a guess was right. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class RoomHandler {
  /** Open "any answer yet?" requests, woken the moment something changes. */
  private waiters = new Set<() => void>();

  constructor(
    private store: RoomStore,
    private deps: RoomDeps,
  ) {}

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (`${req.method} ${url.pathname}`) {
      case 'POST /create':
        return this.create(req);
      case 'POST /join':
        return this.join();
      case 'POST /answer':
        return this.answer(req);
      case 'GET /answer':
        return this.waitForAnswer(req, Number(url.searchParams.get('wait')));
      case 'DELETE /':
        return this.cancel(req);
      default:
        return fail(404, 'not_found');
    }
  }

  /** The store's alarm fired: drop the room if its time is up. */
  async expire() {
    await this.live();
  }

  /** The room if it exists and hasn't timed out; an expired one is cleared (and anyone waiting on it is told). */
  private async live(): Promise<RoomRecord | null> {
    const record = await this.store.load();
    if (!record) return null;
    if (record.expiresAt > this.deps.now()) return record;
    await this.store.clear();
    this.wake();
    return null;
  }

  private wake() {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  /** Host: store the offer. 409 if the code is already in use (the router then tries another). */
  private async create(req: Request): Promise<Response> {
    if (await this.live()) return fail(409, 'conflict');
    const body = await readJson(req);
    if (!body || !isPayload(body.offer)) return fail(400, 'bad_request');
    const record: RoomRecord = {
      offer: body.offer,
      hostToken: this.deps.token(),
      guestToken: null,
      answer: null,
      expiresAt: this.deps.now() + ROOM_TTL_MS,
    };
    await this.store.save(record);
    await this.store.scheduleExpiry(record.expiresAt);
    return json(201, { hostToken: record.hostToken, expiresInS: ROOM_TTL_MS / 1000 });
  }

  /** Friend: take the offer. Works once; a second visitor (or a guess at someone else's code) gets nothing. */
  private async join(): Promise<Response> {
    const record = await this.live();
    if (!record || record.guestToken) return fail(404, 'not_found');
    record.guestToken = this.deps.token();
    await this.store.save(record);
    const body: JoinRoomResponse = { offer: record.offer, guestToken: record.guestToken };
    return json(200, body);
  }

  /** Friend: hand back the answer. Only whoever took the offer can. */
  private async answer(req: Request): Promise<Response> {
    const record = await this.live();
    if (!record?.guestToken) return fail(404, 'not_found');
    const body = await readJson(req);
    if (!body || !isPayload(body.answer) || typeof body.guestToken !== 'string') return fail(400, 'bad_request');
    if (!safeEqual(body.guestToken, record.guestToken)) return fail(403, 'forbidden');
    if (record.answer) return fail(409, 'conflict');
    record.answer = body.answer;
    await this.store.save(record);
    this.wake();
    return new Response(null, { status: 204 });
  }

  /**
   * Host: collect the answer, waiting up to `wait` seconds for it to arrive. 200 with the answer (and the room is
   * then gone), or 204 if none came in time (ask again), or 404 if the room is gone or expired.
   */
  private async waitForAnswer(req: Request, wait: number): Promise<Response> {
    let record = await this.live();
    if (!record) return fail(404, 'not_found');
    if (!safeEqual(bearer(req), record.hostToken)) return fail(403, 'forbidden');

    const seconds = Number.isFinite(wait) ? Math.min(Math.max(wait, 0), MAX_WAIT_S) : 0;
    if (!record.answer && seconds > 0) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, seconds * 1000);
        this.waiters.add(done);
      });
      record = await this.live();
      if (!record) return fail(404, 'not_found');
    }

    if (!record.answer) return new Response(null, { status: 204 });
    await this.store.clear(); // single use: the answer is handed over once, then the room is gone
    const body: WaitAnswerResponse = { answer: record.answer };
    return json(200, body);
  }

  /** Host: give up on the room. */
  private async cancel(req: Request): Promise<Response> {
    const record = await this.live();
    if (!record) return new Response(null, { status: 204 });
    if (!safeEqual(bearer(req), record.hostToken)) return fail(403, 'forbidden');
    await this.store.clear();
    this.wake();
    return new Response(null, { status: 204 });
  }
}
