# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A top-down RPG built with PixiJS v8 + Vite + TypeScript. The repo and the deployed site are fully public, so never commit secrets or private assets. Deployed as a static site to GitHub Pages.

## Direction

The game is intended to become Zelda-like: real-time action combat, item collection, and progression (leveling skills, weapons/armor, magic). The code is split into scenes, systems and entities (below); next up are more zones with map transitions, items/inventory and more enemy kinds. Art, story and gameplay are iterated on incrementally.

## Commands

- `npm run dev` — Vite dev server with HMR (also exposes `window.__game` for playtest scripts, dev only)
- `npm run build` — typecheck, `map -- check`, then production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run verify` — everything CI runs except the build and browser tests: lint, format check, typecheck, unit tests, map check. **Run it before committing.**
- `npm run lint` / `npm run format` / `npm run format:check` — ESLint (type-aware) and Prettier (`.ts`/`.json`/`.yml`; CSS, HTML and Markdown are hand-formatted)
- `npm run test` — Vitest unit tests (`src/**/*.test.ts`, `tools/**/*.test.ts`)
- `npm run test:e2e` — Playwright smoke tests against the production build (set `PW_CHROMIUM` to a local Chromium, e.g. `/opt/pw-browsers/chromium-*/chrome-linux/chrome` in cloud sessions)
- `npm run typecheck` — typecheck only (game, `tools/`, `e2e/`)
- `npm run map -- build|check|render …` — zone specs → map JSON + previews + checks (see Map pipeline)

CI (`.github/workflows/ci.yml`) runs `verify`, `build` and the e2e tests on every pull request; the deploy workflow runs `verify` before publishing.

## PixiJS skills

Vendored in `.claude/skills/` (`.agents/` is a gitignored duplicate). **Before changing anything in `src/` that touches PixiJS, load the `pixijs` skill** and follow the sub-skill it routes to (application, assets, scene-*, ticker, performance, math). Only the sub-skills this game uses are vendored; for anything else the router falls back to the live docs (`https://pixijs.download/release/docs/llms.txt`), or re-add a skill with `npx skills add pixijs/pixijs-skills`. Project conventions that follow them: `TextureStyle.defaultOptions.scaleMode = 'nearest'` and `resolution: devicePixelRatio` + `autoDensity` are set once in `main.ts` (don't set scale modes per texture); dynamic in-world text uses `BitmapText` with the pre-installed `FloatText` font, not `Text`.

Other project skills: `build-zone` (any map change), `add-mob-kind` (new enemy), `add-particle-effect` (new/retuned particle effect), `playtest` (run/screenshot the game in a browser).

## Architecture

Pixi-free logic (rules, collision, camera maths, map format) is kept separate from Pixi code so it is unit-tested without a browser; keep it that way.

- `src/main.ts` boots: creates the PixiJS `Application` (async `app.init`, wrapped in a `void` IIFE — avoid top-level await), registers the manifest, loads assets behind the loading overlay, creates the shared DOM UI (`Hud`, `Menu`, `Dialog`, touch controls) and starts a `SceneManager` with an `OverworldScene`.
- **`src/core/`** — engine plumbing. `Scene.ts`: the `Scene` interface (`root`, `enter`, `update(dt)`, `resize`, `exit`) and `SceneManager` (runs one scene from `app.ticker` with a clamped dt, forwards resizes, and always calls `input.endFrame()` after each update). `camera.ts`: integer zoom chosen from the window size and a follow/clamp offset (`pickZoom`, `followOffset` are pure). `input.ts`: module-level keyboard singleton (`isDown`, one-shot `wasPressed`). `touch.ts`: on-screen controls (below). `textures.ts`: `makeFrame` and `sheetGrid`, a per-sheet cache of frame textures.
- **`src/scenes/OverworldScene.ts`** — one zone: a `MapView` world, the hero, NPC and mobs, hero combat (melee hit circle, Time Bolt projectile for MP, invulnerability blink + knockback, HP/MP regen, defeat → respawn at spawn keeping XP). The action key talks when next to the NPC, otherwise attacks. Dialog freezes the world; the menu pauses it. New areas should be new scenes (or new zones loaded into this one), not more code in here.
- **`src/systems/`** — `combat.ts`: stats, gear, `MobKind`s/`MOB_KINDS` and the damage/XP/level-up rules (`newHero`, `rollDamage`, `gainXp`). `particles.ts` (Pixi-free `Emitter` simulation with fixed pools) and `particleEffects.ts` (the effects, pure data; add one with the `add-particle-effect` skill). `collision.ts`: `Collision` (cell collision from the map plus body-vs-body blocking: characters block each other but can always move apart; per-axis `slide`).
- **`src/entities/`** — `Character.ts` renders the hero/NPCs/mobs from sheets in `public/sprites/` (3 columns x 4 rows of 32x36 frames: walk-A, stand, walk-B; rows back/right/front/left); its container origin is the *feet*, so collision and y-sorting (`zIndex = y`) use it directly. `Mob.ts`: enemy AI state machine (idle/wander → chase → telegraphed windup → strike → recover; stagger on hit; fade and respawn at home), driven through the `MobWorld` interface the scene passes in. `effects.ts`: transient world visuals (slash arc, bolt, floating `BitmapText` numbers) owned by an `Effects` list. `ParticleEffect.ts`: draws a data-defined particle effect (`ParticleContainer`, one per emitter) as an `Effect`; spawn with `particleEffect('name', x, y, { dir })`. Character theme: a boy stranded outside time (the current hero/NPC sprites are placeholder sheets: healer_f / warrior_m, set in `src/assets.ts`).
- **`src/map/`** — `types.ts` (`MapData`, `parseMap`) and `MapView.ts`: a render group with a static `ground` layer (its own render group, drawn from a cached instruction list) and a y-sorted `layer` holding map objects (cullable via `CullerPlugin`) plus everything the scene adds (characters, effects). Add entities to `world.layer`, never to the `MapView` itself.
- **`src/assets.ts`** — all loading goes through the Pixi `Assets` manifest: a `sprites` bundle at boot (hero, NPC and every `MOB_KINDS` sheet) and one bundle per zone (`loadZone(name)`: the map JSON, validated by `parseMap`, then the tilesets it names; `unloadZone`). The map URL carries `__BUILD_ID__` so a deploy never pairs new code with a cached old map. Don't call `Assets.load` ad hoc elsewhere.
- **HTML overlays** (`src/hud/`; markup in `index.html`, styles in `src/ui.css`): `Hud.ts` (HP/MP bars), `Dialog.ts` (`#dialog`; tapping it advances; `layout()` keeps it clear of the touch controls), `Menu.ts` (pause menu: Status / Gear / Controls) and `Loading.ts` are DOM rather than Pixi so text stays sharp on phones and can use safe-area insets.
- **UI look**: Lamoot's RPG GUI kit (CC-BY 3.0, credited in CREDITS.md). `tools/ui/cut-gui.ts` cuts pieces from `art/rpg_gui_v1/RPG_GUI_v1.png` into `src/ui/` (bundled by Vite via `ui.css`): gold frames used as `border-image` on `.panel` (`.thin` variant), `.wood`/`.paper` backgrounds, plank tabs, square buttons, D-pad arrows. Fonts: Cinzel (titles) and Crimson Text (body) from Fontsource. Reuse these classes for new UI rather than inventing new styles.
- **Touch controls**: `src/core/touch.ts` wires the on-screen D-pad (shown when the primary pointer is a finger or after a touch, hidden again on any physical key press) into `input` as virtual arrow-key presses (`input.setVirtual`), and makes every `[data-key]` element (A = KeyJ, B = KeyK, the ☰ and menu ✕ = Escape) press that key while held, so game code only ever reads key codes. To add a button, add a `data-key` element.
- **Map pipeline** — maps are built by agents from code, not painted: **use the `build-zone` skill** (`.claude/skills/build-zone/SKILL.md`) for any map change.
  - `maps/<zone>.ts` (source of truth) uses the `Zone` builder (`tools/map/zone.ts`: `fill`, `patch`, `forest`, `prop`, `block`/`unblock`, `spawn`/`npc`/`mob`) with named assets from `tools/map/catalog.ts`. `npm run map -- build` compiles it to `public/maps/<zone>.json`, renders `maps/out/<zone>.png` + `.debug.png` (gitignored), and runs `tools/map/check.ts`. Never hand-edit the JSON; `npm run build` fails if it's stale or a check errors.
  - The JSON is `MapData`: 32px ground cells referencing 32x32 regions of tileset sheets, free-placed objects (y-sorted by bottom edge), a collision cell list, spawn/NPC cells and mob spawns. `MapView` renders it in the game; `tools/map/image.ts` renders the same way in Node for previews. Tilesets live in `public/tilesets/`; all art is cut on the 32px grid.
  - Collision for props is derived from their art (cells covered by the bottom `solid.band` px of the sprite), forests block their rect, so collision tracks the visuals. The tilesets have no foliage edge tiles — all vegetation is prefabs, and canopies on `object-layer.png` must be split into bleed-free parts (see `treeA`).

## Conventions

- TypeScript is strict plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax` for game code (`tools/` indexes freely). Prefer a clear error over `!` when data can be missing; `!` is fine for DOM lookups that `index.html` guarantees.
- Prettier owns formatting (single quotes, width 120); ESLint is type-aware and bans floating promises.
- New rules/maths go in a Pixi-free module with a `*.test.ts` beside it.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source must be "GitHub Actions"). `vite.config.ts` sets `base: './'` so asset URLs work under the `/<repo>/` subpath — keep asset references relative (put static files in `public/` and don't use root-absolute `/...` paths).
