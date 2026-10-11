# Matchmaking relay

A tiny Cloudflare Worker that lets two players start a 2-player game with a short code like `mighty-apples`
instead of swapping long connection codes by hand.

**Gameplay never goes through it.** The relay only passes along the connection details that start a game (the
WebRTC offer and answer), holds them for up to 10 minutes under the code, hands each seat's offer over once, then forgets them. After
that the two phones talk directly to each other. Those details include the players' public IP addresses, which the
two phones learn anyway in a direct connection.

## How a game starts

A game has one code and up to three seats. A connection offer fits exactly one peer connection, so the host
prepares one offer per seat.

1. The host taps **Create Game**. The game makes three offers and `POST`s them; the relay picks a free code and
   stores them, one per seat.
2. The host's phone then asks the relay "any answers yet?", and the relay holds that request open (up to 20 s at a
   time) until one arrives, so it hears about it within milliseconds.
3. A friend types the code. The relay gives them the next free seat and its offer; they build an answer and `POST` it
   back. A friend who takes a seat but never answers loses it after 60 s.
4. The host collects each answer and connects to that friend. Meanwhile more friends can come. If a friend leaves
   or fails to connect, the host puts a fresh offer in their seat so someone else can take it.
5. When the host taps **Start Game** (or all three seats are taken), the relay stops giving out seats and forgets
   the game a minute later. The phones are already talking directly by then.

The wire format is documented at the top of `src/net/relayApi.ts` and shared with the game's client
(`src/net/relayClient.ts`), so the two can't drift apart.

## Design notes

- **One Durable Object per game code** (`Room`): strongly consistent, so both phones see each other's writes at
  once (Workers KV can lag by up to a minute), and a code that is never used costs nothing once it expires.
- **Free-plan friendly**: SQLite-backed Durable Objects (see `wrangler.toml`). A game setup is roughly 10 requests.
- **Codes** are two words from 256-word lists (65,536 combinations). Only words from the lists reach storage, a code
  stops working when the host starts the game (or after 10 minutes), each seat is given out once, and guesses are
  rate-limited per client (20 joins and 10 games per minute), so stumbling into someone else's game by guessing is
  impractical, not impossible. The worst case is a stranger taking an open seat in a game that is still waiting for
  its friends; the host sees who has joined and can start the game to close it.
- **Browsers only from the game's site**: `ALLOWED_ORIGINS` in `wrangler.toml` (plus localhost for development).
  Other websites get a 403. This is a courtesy to your free quota, not a security boundary.

## Layout

| File | What it is |
|---|---|
| `src/room.ts` | One code's rules (seats, join, answer, answers cursor, reopen a seat, close, cancel, expire). Pure; storage is injected. |
| `src/router.ts` | The public API: CORS, rate limits, picking a code, forwarding to the right room. Pure. |
| `src/limiter.ts` | Fixed-window request counter. Pure. |
| `src/index.ts` | The Cloudflare entry point: wires the above to Durable Objects. |
| `wrangler.toml` | Worker config, bindings, and the allowed origins. |

The logic is tested in Node against an in-memory backend (`tools/relay/`), and `index.ts` was also run on
Cloudflare's own runtime locally (`wrangler dev`) when it was written.

## Try it locally

```bash
npm run relay                                # the same relay, in memory, on http://localhost:8787
VITE_RELAY_URL=http://localhost:8787 npm run dev
```

Open the game in two to four browser windows: Menu > Online > Host > Create Game, then Join in the others.

## Deploying it (one time, free, works from a phone)

Cloudflare builds and deploys the relay straight from this repo (Workers Builds), and redeploys it whenever the
repo's `main` branch changes. It is running at **https://me-rpg-relay.jbogaardt.workers.dev**; if you ever need
to set it up again (new account, new repo):

1. Make a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. Dashboard > **Workers & Pages** > **Create application** > connect your GitHub account and pick this repo.
3. On the "Set up your application" page:
   - **Project name:** `me-rpg-relay` (it must match `name` in `wrangler.toml`).
   - **Build command:** empty. **Deploy command:** `npx wrangler deploy`.
   - **Advanced settings > Path** (the root directory): `relay`. This is the important one; left as `/` it would
     try to deploy the whole game.
   - **Enable Preview builds:** off. **API token:** leave on "Create new token".
   - Cloudflare asks you to choose a `workers.dev` name if the account has none; it becomes part of the address.
4. **Deploy.** The log ends with the relay's address. Put it in `DEPLOYED_RELAY_URL` in `src/net/relayConfig.ts`
   and push. Open `<address>/health` in a browser to check: it should say `me_rpg relay ok`.

The game's site must be listed in `ALLOWED_ORIGINS` in `wrangler.toml` (currently `https://jbogaardt.github.io`).

Every push to `main` triggers a build here, even ones that don't touch `relay/`. They are quick and free, but you
can limit it under the project's **Settings > Build** with a build watch path of `relay/*`.
