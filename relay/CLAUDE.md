# relay: matchmaking Worker

A Cloudflare Worker with Durable Objects (one per game code, plus one for rate limits); `src/index.ts` is the only file
that touches Cloudflare APIs, the rest (`room.ts`, `router.ts`, `limiter.ts`) is pure and runs unchanged in Node against
an in-memory backend (`tools/relay/memory.ts`), which is what the tests and the e2e dev server use. It carries only the
connection details that start a game; gameplay never goes through it.

- **It deploys separately**: Cloudflare builds it from `main` (root directory `relay`, set up in the dashboard, not in
  this repo), so a push that changes `relay/` or `src/net/relayApi.ts` redeploys it a minute or two apart from the
  game. A relay change only reaches players once that build finishes. **Test these first**: they can break everyone's
  co-op setup.
- Changing the API: edit `src/net/relayApi.ts` first, then both sides, and bump `API_VERSION` (the path prefix) if old
  clients would misbehave.
- Live at `https://me-rpg-relay.jbogaardt.workers.dev` (`src/net/relayConfig.ts`); setup is in `relay/README.md`.
