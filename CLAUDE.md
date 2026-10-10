# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A top-down RPG built with PixiJS v8 + Vite + TypeScript. The repo and the deployed site are fully public, so never commit secrets or private assets. Deployed as a static site to GitHub Pages.

## Direction

The game is intended to become Zelda-like: real-time action combat, item collection, and progression (leveling skills, weapons/armor, magic). The current code is a bare scaffold (one hard-coded map, one NPC) — expect `Game.ts` to be split into scenes/systems and the ASCII map to be replaced as these features land. Art, story and gameplay are iterated on incrementally.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — typecheck (`tsc --noEmit`) then production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run typecheck` — typecheck only

There is no linter or test runner yet.

## Architecture

- `src/main.ts` creates the PixiJS `Application` (async `app.init`, wrapped in an IIFE — avoid top-level await) and hands it to `Game`.
- `src/game/Game.ts` owns the scene: a `world` container (tile map, player, NPC) and a `ui` container (dialog box), updated from `app.ticker`. Movement uses per-axis tile collision; dialog state is `lineIndex` (-1 = no dialog, movement is frozen while talking).
- `src/game/map.ts` defines the level as an ASCII grid (`MAP`) plus `BLOCKED` tile chars; `@` and `N` mark player/NPC spawns. Tile colors live in `COLORS` in `Game.ts`. Art is currently placeholder `Graphics` rects, no asset loading yet.
- `src/game/playerArt.ts` holds the hero's pixel art as palette-keyed string rows (16x24 frames composed from head/torso/legs per facing; left = mirrored `side`). It is pure data with no Pixi imports. `src/game/Player.ts` renders those rows to nearest-neighbor canvas textures, handles walk animation, and draws the shadow/pendant aura. The `Player` container's origin is the *feet*, so collision and y-sorting (`zIndex = y` in `Game.update`) use it directly. Character theme: a boy stranded outside time, with a glowing clock pendant.
- `src/game/input.ts` is a module-level keyboard singleton; `Game.update` must call `input.endFrame()` each tick to clear one-shot `wasPressed` state.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source must be "GitHub Actions"). `vite.config.ts` sets `base: './'` so asset URLs work under the `/<repo>/` subpath — keep asset references relative (put static files in `public/` and don't use root-absolute `/...` paths).
