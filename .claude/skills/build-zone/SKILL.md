---
name: build-zone
description: Build or change a game map (zone) for me_rpg from a description - terrain, forests, clearings, bushes, rocks, spawn/NPC/enemy placement, collision. Use whenever the user asks to add, move, reshape or fix anything on a map, or to create a new area. Maps are TypeScript specs in maps/ compiled by `npm run map -- build`; never hand-edit public/maps/*.json.
---

# Build a zone

Maps are code. `maps/<zone>.ts` is the source of truth; `npm run map -- build` compiles it to
`public/maps/<zone>.json` (what the game loads), renders previews, and runs checks. `npm run build`
(and therefore the GitHub Pages deploy) fails if the JSON is stale or a check errors.

## Loop

1. Edit `maps/<zone>.ts` (see `maps/overworld.ts` for a complete example).
2. `npm run map -- build` - prints errors (✗, must fix) and warnings (!, fix or justify).
3. **Look at the result.** Read `maps/out/<zone>.png` (what players see) and
   `maps/out/<zone>.debug.png` (red = blocked, grid every cell, thicker every 5; green = spawn,
   pink = NPC, orange = mobs). For detail: `npm run map -- render <zone> --crop col,row,w,h --scale 2 [--debug]`.
4. Iterate until it looks right and checks pass. Optionally play it: `npm run build && npx vite preview`
   and drive it with Playwright (Chromium is at /opt/pw-browsers/chromium in cloud sessions).
5. Commit the spec **and** the generated JSON together.

## Zone API (`tools/map/zone.ts`)

Coordinates are cells (32px); `col` grows east, `row` grows south. Later calls paint over earlier ones:
ground first, then features, then overrides.

| Call | Does |
|---|---|
| `z.fill(ground, rect?)` | Repeating ground over the map or a rect. |
| `z.patch(ground, rect)` | Ground patch blended into grass: the rect's outer ring becomes edge/corner tiles (sand has them), so the visible fill is the inner `(w-2)x(h-2)`. Min 3x3, rectangles only. |
| `z.forest(rect, {seed?})` | Dense trees that block exactly `rect`; canopy pokes ~18px above the rect's top as walk-behind. Let border rects run 3 cells past the map edge so no gaps show. |
| `z.prop(name, col, row, {dx?, dy?})` | One prefab with the **bottom-left cell of its footprint** at (col,row): bottom edge on the bottom of `row`, centred in the cells its width spans. Collision is derived from the art automatically. |
| `z.block(rect, reason)` / `z.unblock(rect)` | Manual collision overrides, applied last. Use `block` for water/cliffs; the reason silences the invisible-wall warning. Don't hand-block props. |
| `z.spawn(c, r)`, `z.npc(c, r)`, `z.mob(kind, c, r)` | Player start, the NPC, enemy spawns (`kind` must be in `MOB_KINDS`, `src/systems/combat.ts`). |

A `Rect` is `{ col, row, w, h }`.

## Assets (`tools/map/catalog.ts`)

- Ground: `grass`, `sand` (+ sand edge ring for `patch`).
- Prefabs: `treeA`, `treeB` (94x89 canopies, 3x3 cells; block bottom two rows, top row walk-behind),
  `bush` (2x2), `rock`, `rockSmall` (1 cell). Mix `treeA`/`treeB` to avoid repetition.
- The tilesets have **no** foliage ground/edge tiles; all vegetation is prefabs. There are no
  inner-corner or non-rectangular patch shapes yet.

### Adding an asset

Look at the sheet first (Read `public/tilesets/<sheet>.png`, crop/zoom with Python+PIL if needed).
Sprites on `object-layer.png` are packed tightly: a bounding box around a canopy usually includes a
corner of its neighbour, so split it into several `parts` that contain only its own pixels, all ending
on the prefab's bottom edge (see `treeA`). Set `solid.band` to the height of the part that should
block (the rest is walk-behind). Render a test zone and zoom in to confirm no bleed. New sheets also
need to exist in `public/tilesets/`.

## What the checks mean (`tools/map/check.ts`)

- ✗ spawn/NPC/mob outside the map, on a blocked cell, or unreachable from the spawn; unknown mob kind;
  art reading outside its sheet; JSON out of date.
- ! open cells unreachable from the spawn (sealed pockets); "player can walk into foliage" (open cell
  ≥50% covered by art, not directly above something solid, so the player would vanish inside a bush);
  "invisible walls" (blocked cell with almost no art and no `block` reason); cells with no ground.

## Limits today

- The game loads only the `overworld` zone (`START_ZONE` in `src/main.ts`; `loadZone` in `src/assets.ts` loads any zone by name). A new zone file
  builds and checks fine, but travelling between zones needs game code (map transitions) first.
- One NPC per map with fixed dialog (`NPC_LINES` in `src/scenes/OverworldScene.ts`).
