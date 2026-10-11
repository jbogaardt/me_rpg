# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A top-down RPG built with PixiJS v8 + Vite + TypeScript. The repo and the deployed site are fully public, so never commit secrets or private assets. Deployed as a static site to GitHub Pages.

## Direction

The game is intended to become Zelda-like: real-time action combat, item collection, and progression (leveling skills, weapons/armor, magic). The current code is a bare scaffold (one hard-coded map, one NPC) — expect `Game.ts` to be split into scenes/systems and the ASCII map to be replaced as these features land. Art, story and gameplay are iterated on incrementally.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — typecheck, `map -- check`, then production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run typecheck` — typecheck only (game, then `tools/` with Node types)
- `npm run map -- build|check|render …` — zone specs → map JSON + previews + checks (see Map pipeline)

There is no linter or test runner yet.

## Architecture

- `src/main.ts` creates the PixiJS `Application` (async `app.init`, wrapped in an IIFE — avoid top-level await) and hands it to `Game`.
- `src/game/Game.ts` owns the scene: a `MapView` (the world) that also parents the player, NPC and mobs, plus a dialog box, updated from `app.ticker`. Entities y-sort with map objects via `zIndex = feet y`. The camera follows the player at an integer zoom chosen from the window size and is clamped to the map. Movement goes through `Game.slide` (per-axis cell collision, and characters block each other but can always move apart); dialog state is `lines`/`lineIndex` (-1 = no dialog, the world is frozen while talking). The action key talks when next to the NPC, otherwise attacks.
- **Combat**: `combat.ts` holds stats, gear, `MobKind`s and the damage/XP/level-up rules (`newHero`, `rollDamage`, `gainXp`). `Mob.ts` is the enemy AI state machine (idle/wander → chase → telegraphed windup → strike → recover; stagger on hit; fade and respawn at home), driven through the `MobWorld` interface Game passes in. Game handles the hero side: melee hit circle in front of the hero, Time Bolt projectile (MP cost), invulnerability blink + knockback when hit, HP/MP regen, and defeat (respawn at spawn, keep XP). `effects.ts` has transient world visuals (slash arc, bolt, floating numbers) owned by an `Effects` list. Enemies spawn from the map's `mobs` list; `kind` keys into `MOB_KINDS` (combat.ts): `shade` (Greenwood), `raider` (desert), `frostbound` (frost), tougher in that order.
- **HTML overlays** (markup in `index.html`, styles in `src/ui.css`): `Hud.ts` (HP/MP/XP bars, top-left), the dialog box (`#dialog`, positioned by `Game.layoutDialog`; tapping it advances) and `Menu.ts` (pause menu: Status / Gear / Controls tabs; the game is paused while open) are DOM rather than Pixi so text stays sharp on phones and can use safe-area insets.
- **UI look**: Lamoot's RPG GUI kit (CC-BY 3.0, credited in CREDITS.md). `tools/ui/cut-gui.ts` cuts pieces from `art/rpg_gui_v1/RPG_GUI_v1.png` into `src/ui/` (bundled by Vite via `ui.css`): gold frames used as `border-image` on `.panel` (`.thin` variant), `.wood`/`.paper` backgrounds, plank tabs, square buttons, D-pad arrows. Fonts: Cinzel (titles) and Crimson Text (body) from Fontsource. Reuse these classes for new UI rather than inventing new styles.
- **Map pipeline** — maps are built by agents from code, not painted: **use the `build-zone` skill** (`.claude/skills/build-zone/SKILL.md`) for any map change.
  - `maps/<zone>.ts` (source of truth) uses the `Zone` builder (`tools/map/zone.ts`: `fill`, `patch`, `forest`, `prop`, `stamp`, `block`/`unblock`, `spawn`/`npc`/`mob`) with named assets from `tools/map/catalog.ts`. `npm run map -- build` compiles it to `public/maps/<zone>.json`, renders `maps/out/<zone>.png` + `.debug.png` (gitignored), and runs `tools/map/check.ts`. Never hand-edit the JSON; `npm run build` fails if it's stale or a check errors.
  - The JSON is `MapData` (`src/map/types.ts`): 32px ground cells referencing 32x32 regions of tileset sheets, free-placed objects (y-sorted by bottom edge), a collision cell list, spawn/NPC cells and mob spawns. `MapView` renders it in the game; `tools/map/image.ts` renders the same way in Node for previews. Tilesets live in `public/tilesets/`; all art is cut on the 32px grid.
  - Collision for props is derived from their art (cells covered by the bottom `solid.band` px of the sprite), forests block their rect, so collision tracks the visuals. The tilesets have no foliage edge tiles — all vegetation is prefabs, and canopies on `object-layer.png` must be split into bleed-free parts (see `treeA`).
  - **Biomes**: the pack only has grass/sand/water/stone, so snow, ice, frosted trees and withered trees are *derived* sheets (`frost_ground.png`, `frost_objects.png`, `dry_objects.png`, `ground_plus.png`) generated by `tools/map/recolor.ts` (`npm run tilesets`, outputs committed). Same coordinates as the originals, so catalog entries just point at another sheet. `maps/overworld.ts` is one 96x72 world: Frostlands (north), Greenwood (south-west, spawn), Scorched Waste (south-east). Snow and sand both blend into grass, so biomes are kept apart by grass bands.
- `src/game/Character.ts` renders the hero and NPCs from character sheets in `public/sprites/` (3 columns x 4 rows of 32x36 frames: walk-A, stand, walk-B; rows back/right/front/left). Swap characters by loading a different sheet of that layout in `main.ts`. The `Character` container's origin is the *feet*, so collision and y-sorting (`zIndex = y` in `Game.update`) use it directly. Character theme: a boy stranded outside time (the current hero/NPC sprites are placeholder sheets: healer_f / warrior_m).
- `src/game/input.ts` is a module-level keyboard singleton; `Game.update` must call `input.endFrame()` each tick to clear one-shot `wasPressed` state.
- **Touch controls**: `src/game/touch.ts` wires the on-screen D-pad (shown when the primary pointer is a finger or after a touch, hidden again on any physical key press) into `input` as virtual arrow-key presses (`input.setVirtual`), and makes every `[data-key]` element (A = KeyJ, B = KeyK, the ☰ and menu ✕ = Escape) press that key while held, so game code only ever reads key codes. To add a button, add a `data-key` element. `Game.layoutDialog` keeps the dialog box clear of the controls via `touch.rects()`.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source must be "GitHub Actions"). `vite.config.ts` sets `base: './'` so asset URLs work under the `/<repo>/` subpath — keep asset references relative (put static files in `public/` and don't use root-absolute `/...` paths).
