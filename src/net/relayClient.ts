import { API_VERSION, isPayload, MAX_GUESTS, MAX_WAIT_S, type SeatAnswer } from './relayApi';

// The game's side of the matchmaking relay (relay/): turns "make a game", "join this code" and "wait for my
// friend" into HTTP calls, and every failure into words fit to show a player. It only ever carries the connection
// details that start a game; gameplay goes straight between the two phones.

export type RelayErrorKind = 'unreachable' | 'not_found' | 'expired' | 'rate_limited' | 'server';

const MESSAGES: Record<RelayErrorKind, string> = {
  unreachable: 'Can’t reach the game server. Check your connection and try again.',
  not_found: 'That game isn’t open. Check the code, or ask your friend to create a new game.',
  expired: 'Nobody joined in time. Create a new game to get a fresh code.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  server: 'The game server had a problem. Try again in a moment.',
};

/** A relay problem with a message the player can read. */
export class RelayError extends Error {
  constructor(
    readonly kind: RelayErrorKind,
    options?: ErrorOptions,
  ) {
    super(MESSAGES[kind], options);
  }
}

export interface Room {
  code: string;
  hostToken: string;
}

export interface Invitation {
  /** The friend's player number: 1 to MAX_GUESTS (the host is 0). */
  slot: number;
  offer: string;
  guestToken: string;
}

/** What a round of waiting for answers brought. `next` is where to continue from. */
export interface Answers {
  answers: SeatAnswer[];
  next: number;
}

const REQUEST_TIMEOUT_MS = 10_000;
const LONG_POLL_S = Math.min(20, MAX_WAIT_S); // under the relay's cap, and short enough that a dead phone is noticed
const POLL_RETRIES = 3; // brief network drops (walking out of Wi-Fi range) shouldn't cancel a game being set up
const RETRY_DELAY_MS = 1000;

type Json = Record<string, unknown>;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class RelayClient {
  constructor(
    private baseUrl: string,
    private fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** Host: store one offer per seat under a fresh game code. */
  async createRoom(offers: string[], signal?: AbortSignal): Promise<Room> {
    const res = await this.request('POST', '/rooms', { body: { offers }, signal });
    if (res.status !== 201) throw this.failure(res);
    const body = await this.readJson(res);
    if (typeof body.code !== 'string' || typeof body.hostToken !== 'string') throw new RelayError('server');
    return { code: body.code, hostToken: body.hostToken };
  }

  /** Friend: take the next free seat. `code` must already be in canonical form (see normalizeCode). */
  async join(code: string, signal?: AbortSignal): Promise<Invitation> {
    const res = await this.request('POST', `/rooms/${encodeURIComponent(code)}/join`, { signal });
    if (res.status === 404) throw new RelayError('not_found');
    if (res.status !== 200) throw this.failure(res);
    const body = await this.readJson(res);
    const { slot, offer, guestToken } = body;
    if (!isSlot(slot) || !isPayload(offer) || typeof guestToken !== 'string') throw new RelayError('server');
    return { slot, offer, guestToken };
  }

  /** Friend: hand back the answer for the seat they were given. */
  async sendAnswer(code: string, guestToken: string, answer: string, signal?: AbortSignal): Promise<void> {
    const res = await this.request('POST', `/rooms/${encodeURIComponent(code)}/answer`, {
      body: { guestToken, answer },
      signal,
    });
    if (res.status === 404 || res.status === 403) throw new RelayError('expired'); // the host closed up, or the seat timed out
    if (res.status !== 204) throw this.failure(res);
  }

  /**
   * Host: wait for friends' answers after position `after`. The relay holds the request open until one arrives (up to
   * LONG_POLL_S), so an answer comes through within a moment of being sent; an empty list just means "nothing yet", so
   * call again with `next`. Rejects with the signal's reason if aborted, and with 'expired' once the room is gone.
   */
  async waitForAnswers(room: Room, after: number, signal: AbortSignal): Promise<Answers> {
    let drops = 0;
    for (;;) {
      signal.throwIfAborted();
      let res: Response;
      try {
        res = await this.request(
          'GET',
          `/rooms/${encodeURIComponent(room.code)}/answers?after=${after}&wait=${LONG_POLL_S}`,
          {
            token: room.hostToken,
            signal,
            timeoutMs: (LONG_POLL_S + 10) * 1000,
          },
        );
      } catch (err) {
        if (signal.aborted || !(err instanceof RelayError) || err.kind !== 'unreachable' || ++drops > POLL_RETRIES) {
          throw err;
        }
        await sleep(RETRY_DELAY_MS * drops, signal);
        continue;
      }
      if (res.status === 404 || res.status === 403) throw new RelayError('expired');
      if (res.status !== 200) throw this.failure(res);
      const body = await this.readJson(res);
      const answers = parseAnswers(body.answers);
      if (!answers || typeof body.next !== 'number' || !Number.isInteger(body.next) || body.next < after) {
        throw new RelayError('server');
      }
      return { answers, next: body.next };
    }
  }

  /** Host: put a fresh offer in a seat whose friend left or never connected, so someone else can take it. */
  async reopenSeat(room: Room, slot: number, offer: string, signal?: AbortSignal): Promise<void> {
    const res = await this.request('PUT', `/rooms/${encodeURIComponent(room.code)}/seats/${slot}`, {
      body: { offer },
      token: room.hostToken,
      signal,
    });
    if (res.status === 404 || res.status === 409) throw new RelayError('expired');
    if (res.status !== 204) throw this.failure(res);
  }

  /** Host: no more friends. Best effort: the relay forgets the code on its own soon anyway. */
  closeRoom(room: Room): void {
    this.request('POST', `/rooms/${encodeURIComponent(room.code)}/close`, { token: room.hostToken }).catch(
      () => undefined,
    );
  }

  /** Host: tell the relay the code is no longer wanted. Best effort, like closeRoom. */
  cancel(room: Room): void {
    this.request('DELETE', `/rooms/${encodeURIComponent(room.code)}`, { token: room.hostToken }).catch(() => undefined);
  }

  // --- Internals ---

  private async request(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.token) headers.authorization = `Bearer ${options.token}`;

    // One signal that fires on the caller's abort or on timeout, whichever comes first (AbortSignal.any isn't
    // available in every browser that can run the game).
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new RelayError('unreachable')),
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
    );
    const onAbort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) onAbort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.fetchFn(`${this.baseUrl}/${API_VERSION}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        keepalive: method === 'DELETE', // a cancel should still go out if the page is closing
      });
    } catch (err) {
      if (options.signal?.aborted) throw options.signal.reason ?? err; // the caller gave up: not an error to report
      throw new RelayError('unreachable', { cause: err });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  private failure(res: Response): RelayError {
    return new RelayError(res.status === 429 ? 'rate_limited' : 'server');
  }

  private async readJson(res: Response): Promise<Json> {
    try {
      const body: unknown = await res.json();
      return body && typeof body === 'object' ? (body as Json) : {};
    } catch {
      return {};
    }
  }
}

const isSlot = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_GUESTS;

function parseAnswers(value: unknown): SeatAnswer[] | null {
  if (!Array.isArray(value) || value.length > MAX_GUESTS * 4) return null;
  const answers: SeatAnswer[] = [];
  for (const item of value as unknown[]) {
    const { slot, answer } = (item ?? {}) as { slot?: unknown; answer?: unknown };
    if (!isSlot(slot) || !isPayload(answer)) return null;
    answers.push({ slot, answer });
  }
  return answers;
}
