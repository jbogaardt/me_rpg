# Matchmaking relay

A tiny Cloudflare Worker that lets two players start a 2-player game with a short code like `mighty-apples`
instead of swapping long connection codes by hand.

**Gameplay never goes through it.** The relay only passes along the connection details that start a game (the
WebRTC offer and answer), holds them for 5 minutes under the code, hands each over once, then forgets them. After
that the two phones talk directly to each other. Those details include the players' public IP addresses, which the
two phones learn anyway in a direct connection.

## How a game starts

1. The host taps **Create Game**. The game makes an offer and `POST`s it; the relay picks a free code and stores it.
2. The host's phone then asks the relay "any answer yet?", and the relay holds that request open (up to 20 s at a
   time) until one arrives, so it hears about it within milliseconds.
3. The friend types the code. The relay gives them the offer (once), they build an answer and `POST` it back.
4. The host collects the answer, the room is deleted, and the phones connect directly.

The wire format is documented at the top of `src/net/relayApi.ts` and shared with the game's client
(`src/net/relayClient.ts`), so the two can't drift apart.

## Design notes

- **One Durable Object per game code** (`Room`): strongly consistent, so both phones see each other's writes at
  once (Workers KV can lag by up to a minute), and a code that is never used costs nothing once it expires.
- **Free-plan friendly**: SQLite-backed Durable Objects (see `wrangler.toml`). A game setup is roughly 10 requests.
- **Codes** are two words from 256-word lists (65,536 combinations). Only words from the lists reach storage, a code
  works once and for 5 minutes, and guesses are rate-limited per client (20 joins and 10 games per minute), so
  stumbling into someone else's game by guessing is impractical, not impossible. The worst case is a stranger
  joining a game that is still waiting for its friend.
- **Browsers only from the game's site**: `ALLOWED_ORIGINS` in `wrangler.toml` (plus localhost for development).
  Other websites get a 403. This is a courtesy to your free quota, not a security boundary.

## Layout

| File | What it is |
|---|---|
| `src/room.ts` | One code's rules (create / join once / answer / wait / cancel / expire). Pure; storage is injected. |
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

Open the game in two browser windows: Menu > Online > Host > Create Game, then Join in the other window.

## Deploying it (one time, free, works from a phone)

You need a Cloudflare account (free) and to add two secrets to the GitHub repo. After that every change to
`relay/` deploys itself.

1. **Make a Cloudflare account** at https://dash.cloudflare.com/sign-up (the free plan is enough).
2. **Pick a `workers.dev` name.** In the dashboard open **Workers & Pages** (called **Compute** in newer
   dashboards). The first time, it asks you to choose a subdomain; this becomes the relay's address. Wrangler
   can't do this step for you in CI.
3. **Create an API token.** Profile icon > **My Profile** > **API Tokens** > **Create Token** > use the
   **Edit Cloudflare Workers** template > for Account Resources choose your account > **Continue** > **Create
   Token**. Copy the token now; it is shown once.
4. **Find your Account ID.** It is on the **Workers & Pages** overview page (right-hand side), and is the long hex
   string in the dashboard URL.
5. **Add both as GitHub secrets.** The repo > **Settings** > **Secrets and variables** > **Actions** > **New
   repository secret**: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the ID).
6. **Run the deploy.** Repo > **Actions** > **Deploy relay (Cloudflare)** > **Run workflow**. When it finishes, its
   summary shows the relay's URL, like `https://me-rpg-relay.<your-subdomain>.workers.dev`.
7. **Point the game at it.** Put that URL in `DEPLOYED_RELAY_URL` in `src/net/relayConfig.ts` and push (or ask
   Claude to). Until you do, the Online tab says online play isn't set up yet.

If the game is served from somewhere other than `https://jbogaardt.github.io`, change `ALLOWED_ORIGINS` in
`wrangler.toml` to match.
