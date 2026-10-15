# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A top-down RPG built with PixiJS v8 + Vite + TypeScript. The repo and the deployed site are fully public, so never commit secrets or private assets. Deployed as a static site to GitHub Pages.

## Direction

The game is intended to become Zelda-like: real-time action combat, item collection, and progression (leveling skills, weapons/armor, magic), told as many varied D&D-style worlds rather than one. The code is split into scenes, systems and entities, and the content (enemies, people, biomes, scenario nodes, quests, items, shops, loot) is data in `public/content/<campaign>/*.json`, read through `ContentManager` so it can later come from a database. There are two fixed campaigns, `campaign1` (the original world) and `campaign2` (Emberfall Isle, a small test campaign proving the engine runs other content), **random campaigns** assembled from mix-and-match packs with a seed, and **live worlds** grown during play from the DM's story choices (all in `src/content/CLAUDE.md`, with the `?campaign`/`?seed` addresses). **Campaign 1 is the sandbox**: the page plays it unless the address says otherwise, and every new capability is built and tried there first, then made general enough for the packs. **Online, the host is the Dungeon Master** (`docs/dungeon-master.md`): hosting is running the world, not playing in it; solo play is unchanged and is where new abilities are tried. **Next** (not started): zone instances (one map placed more than once), a database of worlds and catalog (duckdb-wasm) and AI help for the DM (new arcs and NPCs through the same validated steps). Art, story and gameplay are iterated on incrementally.

## Where a feature belongs (decide this for every new feature)

Every feature lives in one of these layers; say which in the owning file's design notes (map below) when you add or change it, and keep the line between them clean:

- **Core engine** (`src/core`, `src/net`, `src/map`, `src/entities`, the rules in `src/systems`, the map pipeline): what every world needs and no story would switch off (moving, combat, doors and zones, co-op, the inventory). It is written against registries and properties, **never against a content id**: no `itemOf('waterskin')`, no `'greenwood'` in `src/` (ask an item property such as `waters`, a role such as `QUEST_GIVER`, or a biome's own data instead). Known leftovers from campaign 1, to clear when touched: the trainer `TRAINER = 'orin'`, the skills' training grounds (`SKILLS[].zone`) and the `'town'` fallbacks in `guide.ts`/`QuestLog.ts`.
- **Capability** (`CAPABILITIES` in `src/systems/capabilities.ts`): an engine system some stories want and others do not (the map, hunger, combos, weather...). It is gated with `enabled(id, zone)` at its one choke point, tuned with `setting`, switched per campaign, arc, biome or region, and the content checks refuse content that asks for it where it is off (`checkAgainstCapabilities`). When a new system is something a story could do without, make it a capability in the same change (see `src/systems/CLAUDE.md`).
- **Content** (a campaign's five files, validated by `src/content/schema.ts`): what a world holds (who, where, what story, which goods). A new *kind* of thing is a schema field with its reader and cross-checks (every id it names must exist), an install step in `ContentManager.install` into a registry the engine reads, and a check in `tools/content/campaigns.test.ts` or the map check where a rule spans campaigns.
- **Packs** (`public/content/packs/`, `src/content/packs.ts`): the same content in mix-and-match form for random worlds; a new content kind gets a pack section (merged with the clash check, validated by `checkPacks`) once it is general enough. Campaign 1 gets a feature first; the packs get it when it no longer assumes campaign 1's world.
- **Co-op** is not a layer but a question for every layer (see Conventions): what the host owns and what a guest is sent.

## Commands

- `npm run dev` — Vite dev server with HMR (also exposes `window.__game` for playtest scripts, dev only)
- `npm run build` — typecheck, `map -- check`, `sprites -- check`, then production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run verify` — everything CI runs except the build and browser tests: lint, format check, typecheck, unit tests, map check, sprite check. **Run it before committing** when it is quick; see Working procedure for what must not block a push.
- `npm run lint` / `npm run format` / `npm run format:check` — ESLint (type-aware) and Prettier (`.ts`/`.json`/`.yml`; CSS, HTML and Markdown are hand-formatted)
- `npm run test` — Vitest unit tests (`src/**/*.test.ts`, `tools/**/*.test.ts`)
- `npm run test:e2e` — Playwright smoke tests against the production build (set `PW_CHROMIUM` to a local Chromium, e.g. `/opt/pw-browsers/chromium-*/chrome-linux/chrome` in cloud sessions)
- `npm run typecheck` — typecheck only (game, `tools/`, `e2e/`, `relay/`)
- `npm run relay` — the matchmaking relay in memory on `http://localhost:8787` (use with `VITE_RELAY_URL=http://localhost:8787 npm run dev` to try online play locally)
- `npm run dm-bot -- [url]` — the autonomous Dungeon Master: hosts a game of the page headless, prints its code and runs the DM's whole job (`server/README.md`; its AI services are mocked for now)
- `npm run map -- build|check|render|layout …` — zone specs → map JSON + previews + checks; `layout <biome>` prints a biome's walls, gaps and open ground (see `tools/map/CLAUDE.md`)
- `npm run sprites -- build|check|preview …` — LPC part catalog → packed layer sheets (see `src/sprites/CLAUDE.md`). `build` needs a clone of the LPC generator (`LPC_DIR`); `check` (run by `verify` and `build`) does not

CI (`.github/workflows/ci.yml`) runs `verify`, `build` and the e2e tests on every pull request; the deploy workflow runs `verify` before publishing.

## PixiJS skills

Vendored in `.claude/skills/` (`.agents/` is a gitignored duplicate). **Before changing anything in `src/` that touches PixiJS, load the `pixijs` skill** and follow the sub-skill it routes to (application, assets, scene-*, ticker, performance, math). Only the sub-skills this game uses are vendored; for anything else the router falls back to the live docs (`https://pixijs.download/release/docs/llms.txt`), or re-add a skill with `npx skills add pixijs/pixijs-skills`. Project conventions that follow them: `TextureStyle.defaultOptions.scaleMode = 'nearest'` and `resolution: devicePixelRatio` + `autoDensity` are set once in `main.ts` (don't set scale modes per texture); dynamic in-world text uses `BitmapText` with the pre-installed `FloatText` font, not `Text`.

Other project skills: `build-zone` (any map change), `add-mob-kind` (new enemy), `add-sprite-part` (new hair/armor/weapon/monster part), `add-particle-effect` (new/retuned particle effect), `playtest` (run/screenshot the game in a browser).

## Architecture

Pixi-free logic (rules, collision, camera maths, map format) is kept separate from Pixi code so it is unit-tested without a browser; keep it that way.

- `src/main.ts` boots: creates the PixiJS `Application` (async `app.init`, wrapped in a `void` IIFE — avoid top-level await), registers the manifest, loads the content (`ContentManager.load(staticContent)`, then `install()`), loads assets and the start node's zone behind the loading overlay, creates the shared DOM UI (`Hud`, `Menu`, `Dialog`, touch controls) and starts a `SceneManager` with an `OverworldScene`.

## Where the detail lives (progressive disclosure)

These files describe design philosophy, architecture and the traps that bite, not facts a grep finds: constants, field names and formats live in the code and its file headers (**put an explanation there when a header lacks one**). Directory-scoped `CLAUDE.md` files load when you work in that directory. **When a change alters a design rule or invariant, update the file that owns it in the same change:**

- `src/content/CLAUDE.md`: campaigns, packs, random and live worlds, ports, the world log. `src/core/CLAUDE.md`: scenes, camera, input, bindings, touch. `src/map/CLAUDE.md`: map format and streaming. `src/hud/CLAUDE.md`: overlays, map overlay, UI look. `src/entities/CLAUDE.md`: mobs, effects, ambient. `src/sprites/CLAUDE.md`: paper-doll characters. `src/CLAUDE.md`: boot and assets.
- `src/scenes/CLAUDE.md`: the overworld, arena, simulation, zones and doors. `src/systems/CLAUDE.md`: capabilities, combat, balance, with design notes on quests, magic, survival, economy and props.
- `src/net/CLAUDE.md`: co-op design, the protocol rules, trading. `relay/CLAUDE.md`: the matchmaking Worker.
- `tools/map/CLAUDE.md` and `maps/CLAUDE.md`: the map pipeline, catalog, world layout, shop buildings.
- `docs/dungeon-master.md`: the host as Dungeon Master, the bar, director, DM quests, epics, possession. `server/README.md`: the bot that runs the DM from outside the game.

## Working procedure (rapid dev mode)

The project is in rapid development, and this is how every session (Claude or human) works until the maintainers say it has matured:

- **Push to `main` before the full test suite, then fix forward.** Do not wait for `npm run build` or `npm run test:e2e` (the e2e suite takes 10+ minutes) before pushing to `main`. Push, then run them, and if something fails, fix it in a follow-up push. The game is a static single-page site, so a bad push cannot take anyone's running copy offline; other developers getting current code quickly matters more than a gate. A failing check after a push is the next thing to fix, not a reason to revert unless it makes the game unplayable.
- **Merge `main` in first, and often.** Drift is the real cost: fetch and merge `origin/main` before starting work and again right before pushing, and resolve conflicts then rather than leaving them for a PR. Keep changes small and push them as soon as they are coherent. Prefer a fast-forward push to `main` when the branch already contains it.
- **Hooks enforce the merge rule** (`.claude/settings.json`, scripts in `.claude/hooks/`): at session start `sync-main.sh` fetches `origin/main` and merges it into your branch when that is clean (it reports, and leaves the tree alone, if it conflicts or you have uncommitted changes); when a session ends `check-main.sh` blocks once if your branch has commits that are behind `origin/main`, telling you to merge now. They do nothing offline, on `main`, or on a detached HEAD.
- **Still cheap and worth doing before a push**: `npm run typecheck` and the unit tests (`npm run test`, seconds). If a quick check fails, fix it before pushing; do not skip it just because the full suite may be skipped.
- **Two things are not covered by "it cannot go offline"**: the matchmaking relay (`relay/`) is a live Cloudflare Worker that redeploys from `main`, and the game and relay deploy a minute or two apart. A change to `relay/` or to the relay API (`src/net/relayApi.ts`) can break everyone's co-op setup, so test those first. A protocol change (`PROTOCOL_VERSION`) makes players on the old page unable to play with players on the new one until they reload; that is expected, but say so in the commit.
- Never commit secrets or private assets (the repo and site are public), whatever the pace.

## Conventions

- **Name the layer** (see Where a feature belongs): every new feature is core engine, a capability, content or a pack section, and the owning file's notes say so. A system a story could do without is a capability from the start; a new kind of thing in the world is content, never an id in `src/`.
- **Keep multiplayer in sync with single player.** Co-op is not an afterthought: whenever a feature touches gameplay state (stats, gold, pack, gear, shops, chests, combat, mobs, map objects, a new key or menu tab), decide how it behaves for the host and for a guest *in the same change*. The host owns every hero and all simulation; a guest only sends wishes (`do`, `tr`, input) and renders what it is told (`snap`, `pack`, `looks`, `trade`). If something is solo/host-only for now, say so in the UI (e.g. the guest's "kept by the host" note) and in this file. Anything new that a guest must see goes through `src/net/protocol.ts` (validated in `parseMessage`, version bumped, a `protocol.test.ts` case) and `session.ts`; anything new that needs a guest's input is a numbered/ackable command, not a raw event. Add unit tests for the pure rules and an `e2e/multiplayer.spec.ts` case when a flow spans two players. **When you change a single-player system, update the co-op text (and the matching text in the other direction; see the map above for which file) so the docs always describe both.**

- TypeScript is strict plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax` for game code (`tools/` indexes freely). Prefer a clear error over `!` when data can be missing; `!` is fine for DOM lookups that `index.html` guarantees.
- **Boundaries and docs are enforced, not just described**: an ESLint rule (`eslint.config.js`) keeps `systems`, `net` and `content` Pixi-free and unaware of `entities`/`scenes`/`hud`, and `tools/architecture.test.ts` fails when a doc names a file or symbol that no longer exists, when a doc outgrows its size budget (trim, don't raise it), or when game code names a campaign 1 biome.
- Prettier owns formatting (single quotes, width 120); ESLint is type-aware and bans floating promises.
- New rules/maths go in a Pixi-free module with a `*.test.ts` beside it.

## Roadmap

1. ✅ Terrain metadata (`surface`, `level`, `ramps`, object `tag`) and visual plateaus with stairs.
2. ✅ Footprints and falling leaves. Next ambient ideas: dust/snow puffs underfoot, drifting snow and sand, animated water (`graphics-tiles-waterflow.png`), wind sway on canopies.
3. Dynamic movement: per-level collision in `systems/collision.ts`, one-way ledges to jump down, mobs/projectiles that respect height.

## Deployment

The relay (`relay/`) deploys separately: Cloudflare builds and deploys it from `main` itself (no GitHub workflow); see `relay/README.md`. A relay change only reaches players once that build has finished, so wait for it before relying on a new API.

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source must be "GitHub Actions"). `vite.config.ts` sets `base: './'` so asset URLs work under the `/<repo>/` subpath — keep asset references relative (put static files in `public/` and don't use root-absolute `/...` paths).