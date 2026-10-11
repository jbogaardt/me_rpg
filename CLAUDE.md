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
- `src/game/Game.ts` owns the scene: a `MapView` (the world) that also parents the player, NPC and mobs, plus a dialog box, updated from `app.ticker`. Entities y-sort with map objects via `zIndex = feet y`. The camera follows the player at an integer zoom chosen from the window size and is clamped to the map. Movement goes through `Game.slide` (per-axis cell collision, and characters block each other but can always move apart); dialog state is `lines`/`lineIndex` (-1 = no dialog, the world is frozen while talking). The action key talks when next to the NPC, otherwise attacks.
- **Combat**: `combat.ts` holds stats, gear, `MobKind`s and the damage/XP/level-up rules (`newHero`, `rollDamage`, `gainXp`). `Mob.ts` is the enemy AI state machine (idle/wander → chase → telegraphed windup → strike → recover; stagger on hit; fade and respawn at home), driven through the `MobWorld` interface Game passes in. Game handles the hero side: melee hit circle in front of the hero, Time Bolt projectile (MP cost), invulnerability blink + knockback when hit, HP/MP regen, and defeat (respawn at spawn, keep XP). `effects.ts` has transient world visuals (slash arc, bolt, floating numbers) owned by an `Effects` list. The test mob's placement is the `MOB_SPAWNS` constant in Game until the map format/editor supports mobs.
- **HTML overlays** (markup in `index.html`, styles in `src/ui.css`): `Hud.ts` (HP/MP/XP bars, top-left) and `Menu.ts` (pause menu: Status / Gear / Controls tabs; the game is paused while open) are DOM rather than Pixi so text stays sharp on phones and can use safe-area insets.
- **Map pipeline** (`src/map/`): the overworld is data, not code — `public/maps/overworld.json` (`MapData` in `types.ts`): 32px ground cells that reference 32x32 regions of tileset sheets, free-placed objects (trees/rocks, y-sorted by bottom edge), a collision cell list, and spawn/NPC cells. `MapView` renders it and is shared by the game and the editor. Tilesets live in `public/tilesets/` and must be listed in `SHEET_FILES` (`sheets.ts`); all art is cut on the 32px grid.
- **Map editor**: `editor.html` + `src/editor/main.ts` (second Vite entry, served at `/editor.html`). Pick regions from a sheet, paint ground/objects/collision/spawn/NPC, undo, autosave to localStorage. `Save to project` POSTs to a dev-only Vite middleware (`vite.config.ts`) that writes `public/maps/overworld.json`; on the deployed site it downloads instead. Commit the JSON to publish map changes.
  - Map pitfalls: the tilesets have no foliage ground/edge tiles — every bush/tree is an object sprite from `object-layer.png`, and the editor's click-to-pick bounding box for canopies bleeds into neighbouring sprites (the current overworld uses split, bleed-free source rects). The editor snaps an object's *top-left*, so bottoms can land off the 32px grid; block the cells under the bottom ~2 rows of a canopy (top row stays walk-behind). Sand uses the grass→sand ring at `ground_tiles.png` (192..256, 128..192).
- `src/game/Character.ts` renders the hero and NPCs from character sheets in `public/sprites/` (3 columns x 4 rows of 32x36 frames: walk-A, stand, walk-B; rows back/right/front/left). Swap characters by loading a different sheet of that layout in `main.ts`. The `Character` container's origin is the *feet*, so collision and y-sorting (`zIndex = y` in `Game.update`) use it directly. Character theme: a boy stranded outside time (the current hero/NPC sprites are placeholder sheets: healer_f / warrior_m).
- `src/game/input.ts` is a module-level keyboard singleton; `Game.update` must call `input.endFrame()` each tick to clear one-shot `wasPressed` state.
- **Touch controls**: `src/game/touch.ts` wires the on-screen D-pad (shown only on touch devices) into `input` as virtual arrow-key presses (`input.setVirtual`), and makes every `[data-key]` element (A = KeyJ, B = KeyK, the ☰ and menu ✕ = Escape) press that key while held, so game code only ever reads key codes. To add a button, add a `data-key` element. `Game.layoutDialog` keeps the dialog box clear of the controls via `touch.rects()`.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source must be "GitHub Actions"). `vite.config.ts` sets `base: './'` so asset URLs work under the `/<repo>/` subpath — keep asset references relative (put static files in `public/` and don't use root-absolute `/...` paths).
