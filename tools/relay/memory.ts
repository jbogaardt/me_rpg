import { randomBytes, randomInt } from 'node:crypto';
import { hit, type LimiterState } from '../../relay/src/limiter';
import { RoomHandler, type RoomRecord, type RoomStore } from '../../relay/src/room';
import { handleRequest, LIMITS, type Bucket, type RelayDeps } from '../../relay/src/router';

// The relay running in plain memory, for unit tests and the local dev server (tools/relay/dev-server.ts). It is the
// same room and router code the Cloudflare Worker runs; only the storage and the clock are swapped.

export interface MemoryRelayOptions {
  now?: () => number;
  allowedOrigins?: readonly string[];
}

class MemoryRoomStore implements RoomStore {
  private record: RoomRecord | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onExpire: () => void = () => undefined;

  constructor(private now: () => number) {}

  load() {
    return Promise.resolve(this.record ? { ...this.record } : null);
  }

  save(record: RoomRecord) {
    this.record = { ...record };
    return Promise.resolve();
  }

  clear() {
    this.record = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return Promise.resolve();
  }

  scheduleExpiry(at: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onExpire(), Math.max(0, at - this.now()));
    this.timer.unref(); // never keeps a test run or the dev server alive
    return Promise.resolve();
  }
}

export interface MemoryRelay {
  deps: RelayDeps;
  handle(request: Request): Promise<Response>;
  /** Codes currently holding a room (for assertions). */
  codes(): string[];
}

export function createMemoryRelay(options: MemoryRelayOptions = {}): MemoryRelay {
  const now = options.now ?? (() => Date.now());
  const rooms = new Map<string, { handler: RoomHandler; store: MemoryRoomStore }>();
  const windows = new Map<string, LimiterState>();

  const deps: RelayDeps = {
    room(code) {
      let room = rooms.get(code);
      if (!room) {
        const store = new MemoryRoomStore(now);
        const handler = new RoomHandler(store, { now, token: () => randomBytes(16).toString('base64url') });
        store.onExpire = () => void handler.expire();
        room = { handler, store };
        rooms.set(code, room);
      }
      const { handler } = room;
      return { fetch: (request) => handler.handle(request) };
    },
    allow(client, bucket: Bucket) {
      const key = `${bucket}:${client}`;
      const { max, windowMs } = LIMITS[bucket];
      const result = hit(windows.get(key), now(), max, windowMs);
      windows.set(key, result.state);
      return Promise.resolve(result.allowed);
    },
    randomInt: (n) => randomInt(n),
    allowedOrigins: options.allowedOrigins ?? [],
  };

  return {
    deps,
    handle: (request) => handleRequest(request, deps),
    codes: () => [...rooms.keys()],
  };
}
