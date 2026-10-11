# Me RPG

A small top-down RPG built with [PixiJS](https://pixijs.com) v8, Vite and TypeScript, deployed to GitHub Pages.

## Develop

```bash
npm install
npm run dev
```

Controls: WASD / arrow keys to move, Space / J / Enter / E to attack (or talk when next to the NPC),
K / Q to cast Time Bolt (costs MP), Esc / I / Tab for the menu.
On phones and tablets an on-screen D-pad (drag your thumb, 8-way) plus **A** (attack/talk), **B** (magic)
and **☰** (menu) buttons appear.

A Shade (the dark ninja) wanders the southeast field as a test enemy: it chases you on sight and
attacks after a yellow-flashing windup. It respawns a few seconds after dying; if you fall, you wake
at the spawn point with full HP/MP and keep your XP.

Checks (all run in CI on every pull request):

```bash
npm run verify    # lint, format check, typecheck, unit tests, map check
npm run test:e2e  # browser smoke tests against the production build (needs Chromium)
npm run build     # typecheck, map check, production build
```

## Two players

Menu > Online: one player taps **Host > Create Game** and reads out the short code (like `mighty-apples`);
the other taps **Join** and types it (or opens the join link). Gameplay runs directly between the phones;
a small Cloudflare relay (`relay/`, setup in `relay/README.md`) only swaps the connection details that start a game.
To try it on one machine: `npm run relay`, then `VITE_RELAY_URL=http://localhost:8787 npm run dev` and open two windows.

## Maps

Maps are built from code so an AI agent can author them: `maps/overworld.ts` describes the zone
(ground, forests, bushes, rocks, spawn, NPC, enemies) and

```bash
npm run map -- build    # -> public/maps/overworld.json + previews in maps/out/, then checks
```

compiles it, deriving collision from the art and blending ground edges. Ask Claude to change the map
in plain words; the `build-zone` skill (`.claude/skills/build-zone/`) tells it how. Commit the spec and
the generated JSON together; the deploy fails if they disagree.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
