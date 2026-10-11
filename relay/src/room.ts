import {
  CLAIM_TTL_MS,
  isOfferList,
  isPayload,
  MAX_WAIT_S,
  ROOM_TTL_MS,
  type AnswersResponse,
  type ErrorKind,
  type JoinRoomResponse,
} from '../../src/net/relayApi';

// One game code's worth of state and rules. It speaks a tiny internal HTTP dialect (the router forwards to it),
// and is written against a RoomStore so the same code runs inside a Durable Object (index.ts) and in Node (tests
// and the local dev server). Nothing here knows what an offer or answer contains.
//
// A room has one seat per friend who can join. Each seat holds an offer made for exactly one peer connection; a
// friend claims the next free seat, answers it, and the host collects answers in order with a cursor.

export interface Seat {
  offer: string;
  /** Set when a friend has taken this seat; cleared if they never answer in time and someone else takes it. */
  guestToken: string | null;
  claimedAt: number;
  answered: boolean;
}

export interface RoomRecord {
  hostToken: string;
  seats: Seat[];
  /** Every answer so far, in arrival order. The host reads from a cursor, so it never misses or repeats one. */
  answers: { slot: number; answer: string }[];
  /** No more friends can join (the host started the game, or every seat is taken for good). */
  closed: boolean;
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

const SEAT_PATH = /^\/seats\/(\d+)$/;

export class RoomHandler {
  /** Open "any answers yet?" requests, woken the moment something changes. */
  private waiters = new Set<() => void>();

  constructor(
    private store: RoomStore,
    private deps: RoomDeps,
  ) {}

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const seat = SEAT_PATH.exec(url.pathname);
    if (seat && req.method === 'PUT') return this.reopenSeat(req, Number(seat[1]));
    switch (`${req.method} ${url.pathname}`) {
      case 'POST /create':
        return this.create(req);
      case 'POST /join':
        return this.join();
      case 'POST /answer':
        return this.answer(req);
      case 'GET /answers':
        return this.collect(req, Number(url.searchParams.get('after')), Number(url.searchParams.get('wait')));
      case 'POST /close':
        return this.close(req);
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

  /** The room's host, or the error to send back instead. */
  private async asHost(req: Request): Promise<RoomRecord | Response> {
    const record = await this.live();
    if (!record) return fail(404, 'not_found');
    if (!safeEqual(bearer(req), record.hostToken)) return fail(403, 'forbidden');
    return record;
  }

  /** Host: store the offers, one per seat. 409 if the code is already in use (the router then tries another). */
  private async create(req: Request): Promise<Response> {
    if (await this.live()) return fail(409, 'conflict');
    const body = await readJson(req);
    if (!body || !isOfferList(body.offers)) return fail(400, 'bad_request');
    const record: RoomRecord = {
      hostToken: this.deps.token(),
      seats: body.offers.map((offer) => ({ offer, guestToken: null, claimedAt: 0, answered: false })),
      answers: [],
      closed: false,
      expiresAt: this.deps.now() + ROOM_TTL_MS,
    };
    await this.store.save(record);
    await this.store.scheduleExpiry(record.expiresAt);
    return json(201, { hostToken: record.hostToken, expiresInS: ROOM_TTL_MS / 1000, seats: record.seats.length });
  }

  /**
   * Friend: take the next free seat and its offer. A seat is free if nobody has claimed it, or whoever did never
   * answered in time. Once the room is closed or full, a visitor (or a guess at someone else's code) gets nothing.
   */
  private async join(): Promise<Response> {
    const record = await this.live();
    if (!record || record.closed) return fail(404, 'not_found');
    const now = this.deps.now();
    const index = record.seats.findIndex((s) => !s.guestToken || (!s.answered && now - s.claimedAt > CLAIM_TTL_MS));
    const seat = record.seats[index];
    if (!seat) return fail(404, 'not_found');
    seat.guestToken = this.deps.token();
    seat.claimedAt = now;
    seat.answered = false;
    await this.store.save(record);
    const body: JoinRoomResponse = { slot: index + 1, offer: seat.offer, guestToken: seat.guestToken };
    return json(200, body);
  }

  /** Friend: hand back the answer for the seat they claimed. Only that seat's holder can, once. */
  private async answer(req: Request): Promise<Response> {
    const record = await this.live();
    if (!record) return fail(404, 'not_found');
    const body = await readJson(req);
    if (!body || !isPayload(body.answer) || typeof body.guestToken !== 'string') return fail(400, 'bad_request');
    const { guestToken, answer } = body as { guestToken: string; answer: string };
    const index = record.seats.findIndex((s) => s.guestToken !== null && safeEqual(guestToken, s.guestToken));
    const seat = record.seats[index];
    if (!seat) return fail(403, 'forbidden');
    if (seat.answered) return fail(409, 'conflict');
    seat.answered = true;
    record.answers.push({ slot: index + 1, answer });
    await this.store.save(record);
    this.wake();
    return new Response(null, { status: 204 });
  }

  /**
   * Host: the answers that arrived after position `after`, waiting up to `wait` seconds if there are none yet.
   * Always 200 with a (possibly empty) list and the cursor to continue from, or 404 once the room is gone.
   */
  private async collect(req: Request, after: number, wait: number): Promise<Response> {
    let record = await this.asHost(req);
    if (record instanceof Response) return record;
    const from = Number.isInteger(after) && after > 0 ? after : 0;

    const seconds = Number.isFinite(wait) ? Math.min(Math.max(wait, 0), MAX_WAIT_S) : 0;
    if (record.answers.length <= from && seconds > 0) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, seconds * 1000);
        this.waiters.add(done);
      });
      record = await this.asHost(req);
      if (record instanceof Response) return record;
    }

    const body: AnswersResponse = { answers: record.answers.slice(from), next: record.answers.length };
    return json(200, body);
  }

  /** Host: put a fresh offer in a seat (its friend left or never connected), so the seat can be taken again. */
  private async reopenSeat(req: Request, slot: number): Promise<Response> {
    const record = await this.asHost(req);
    if (record instanceof Response) return record;
    const seat = record.seats[slot - 1];
    if (!seat) return fail(404, 'not_found');
    if (record.closed) return fail(409, 'conflict');
    const body = await readJson(req);
    if (!body || !isPayload(body.offer)) return fail(400, 'bad_request');
    record.seats[slot - 1] = { offer: body.offer, guestToken: null, claimedAt: 0, answered: false };
    await this.store.save(record);
    return new Response(null, { status: 204 });
  }

  /**
   * Host: no more friends. The room is kept a little longer so a friend who took a seat a moment ago can still
   * answer, then it is forgotten.
   */
  private async close(req: Request): Promise<Response> {
    const record = await this.asHost(req);
    if (record instanceof Response) return record;
    record.closed = true;
    record.expiresAt = Math.min(record.expiresAt, this.deps.now() + CLAIM_TTL_MS);
    await this.store.save(record);
    await this.store.scheduleExpiry(record.expiresAt);
    return new Response(null, { status: 204 });
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
