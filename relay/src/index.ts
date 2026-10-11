import { DurableObject } from 'cloudflare:workers';
import { hit, type LimiterState } from './limiter';
import { RoomHandler, type RoomRecord, type RoomStore } from './room';
import { handleRequest, LIMITS, type Bucket } from './router';

// Cloudflare Worker entry point. Every game code is its own Durable Object (strongly consistent, single-threaded,
// and gone when the room is), so two phones always see each other's writes at once. A second Durable Object type
// counts requests per client for rate limiting. Both use the free-plan SQLite storage (see wrangler.toml).

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  LIMITER: DurableObjectNamespace<Limiter>;
  /** Comma-separated origins allowed to call the API from a browser, e.g. https://you.github.io */
  ALLOWED_ORIGINS?: string;
}

const RECORD = 'room';

export class Room extends DurableObject<Env> {
  private handler: RoomHandler;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const storage = ctx.storage;
    const store: RoomStore = {
      load: async () => (await storage.get<RoomRecord>(RECORD)) ?? null,
      save: (record) => storage.put(RECORD, record),
      clear: async () => {
        await storage.deleteAlarm();
        await storage.deleteAll();
      },
      scheduleExpiry: (at) => storage.setAlarm(at),
    };
    this.handler = new RoomHandler(store, {
      now: () => Date.now(),
      token: () => randomToken(),
    });
  }

  override fetch(request: Request): Promise<Response> {
    return this.handler.handle(request);
  }

  override async alarm() {
    await this.handler.expire();
  }
}

export class Limiter extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const max = Number(url.searchParams.get('max'));
    const windowMs = Number(url.searchParams.get('windowMs'));
    const now = Date.now();
    const { state, allowed } = hit(await this.ctx.storage.get<LimiterState>('w'), now, max, windowMs);
    await this.ctx.storage.put('w', state);
    await this.ctx.storage.setAlarm(state.start + windowMs); // tidy up once the window is over
    return Response.json({ allowed });
  }

  override async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

/** 128 random bits as URL-safe text. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Uniform integer in [0, n) from crypto randomness (rejection sampling, so no modulo bias). */
function randomInt(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while ((buffer[0] ?? 0) >= limit);
  return (buffer[0] ?? 0) % n;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      room: (code) => env.ROOMS.get(env.ROOMS.idFromName(code)),
      allow: async (client, bucket: Bucket) => {
        const { max, windowMs } = LIMITS[bucket];
        const stub = env.LIMITER.get(env.LIMITER.idFromName(`${bucket}:${client}`));
        const response = await stub.fetch(`https://limiter.internal/?max=${max}&windowMs=${windowMs}`);
        return (await response.json<{ allowed: boolean }>()).allowed;
      },
      randomInt,
      allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    });
  },
} satisfies ExportedHandler<Env>;
