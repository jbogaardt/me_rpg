---
name: build-zone
description: Build or change a game map (zone) for me_rpg from a description - terrain, forests, clearings, bushes, rocks, spawn/NPC/enemy placement, collision. Use whenever the user asks to add, move, reshape or fix anything on a map, or to create a new area. Maps are TypeScript specs in maps/ compiled by `npm run map -- build`; never hand-edit public/maps/*.json.
---

# Build a zone

Maps are code. `maps/<zone>.ts` is the source of truth; `npm run map -- build` compiles it to
`public/maps/<zone>.json` (what the game loads), renders previews, and runs checks. `npm run build`
(and therefore the GitHub Pages deploy) fails if the JSON is stale or a check errors.

## Loop

1. Edit `maps/<zone>.ts` (see `maps/greenwood.ts` for a complete example). For a biome, first look at
   `npm run map -- layout <biome>`: its walls (`#`), gaps (`=`) and open ground (`.`) in world cells.
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
| `z.paint(terrain, rects, {erase?})` | Autotiled terrain from the LPC atlas (see Terrain below) over the cells of one rect or many: full inside, soft edges and inner corners half a cell past them, so any union of rects works. Doesn't block: `block` water/lava/pits yourself. |
| `z.patch(ground, rect)` | Ground patch blended into grass: the rect's outer ring becomes edge/corner tiles (sand has them), so the visible fill is the inner `(w-2)x(h-2)`. Min 3x3, rectangles only. |
| `z.forest(rect, {seed?, trees?})` | Dense trees that block exactly `rect` (`trees`: `TREES` default, `FROST_TREES`, `DRY_TREES`); canopy pokes ~18px above the rect's top as walk-behind. Let border rects run 3 cells past the map edge so no gaps show. |
| `z.prop(name, col, row, {dx?, dy?})` | One prefab with the **bottom-left cell of its footprint** at (col,row): bottom edge on the bottom of `row`, centred in the cells its width spans. Collision is derived from the art automatically. |
| `z.stamp(name, col, row)` | Copies a pre-painted ground decoration (`skull`, `dune`, `crater`, `pit`) top-left at (col,row); opaque source cells only. No collision. |
| `z.plateau(rect, {kind?, stairs?})` | Raised plateau. `rect` = walkable top (>= 4x4 cells). Rim rocks fill the 1-cell ring N/W/E and the rock face the 2 rows S of it (all blocked, plus the 4 corner cells of `rect`). `kind`: `'grass'` (default), `'frost'` (snow top; lay it on snow), `'dry'` (sand top). `stairs`: centre columns of 3-wide staircases cut into the south face (`rect.col+2 <= c <= rect.col+w-3`, so w >= 5; >= 3 columns apart). Stairs are the only way up; the top gets level +1 and the stair cells become ramps. Put props/mobs on top with the usual calls. |
| `z.block(rect, reason)` / `z.unblock(rect)` | Manual collision overrides, applied last. Use `block` for water/cliffs; the reason silences the invisible-wall warning. Don't hand-block props. |
| `z.spawn(c, r)`, `z.npc(c, r)`, `z.mob(kind, c, r)` | Player start, the NPC, enemy spawns (`kind` must be in `MOB_KINDS`, `src/systems/combat.ts`). |
| `z.shop(id, c, r)` | A shopkeeper (`id` is a key of `SHOPS`, `src/systems/shops.ts`) standing on an open cell, normally inside a shop room (`tools/map/interiors.ts` builds one). |
| `z.door(c, r, w, toZone, toCol, toRow)` | A doorway: walking onto the `w` cells from (c, r) takes the player to (toCol, toRow) of another zone. The cells are forced open (a building's art would block them) and must be reachable. The arrival cell must be open and must not itself be a door; the other zone needs a door back (`npm run map -- check` verifies all of this across zones). |
| `z.indoor()` | Marks the zone a room: no weather, no footprints or leaves, no co-op overview map. |
| `z.chest(kind, loot, c, r)` | A treasure chest (`loot` is a key of `CHEST_LOOTS`, `src/systems/chests.ts`). Shops sell the common gear, so chests hold what no shop stocks, restoratives and gold purses. |

A `Rect` is `{ col, row, w, h }`.

Biome specs (`defineBiome`, below) also get `z.bounds` (the biome's box), `z.owns(c, r)`, `z.free(c, r)`,
`z.keepClear(rects)` (no scattered props there: roads, plazas, lakes) and
`z.scatter(prefabs, { count, rect?, seed?, margin?, where? })`, which sprinkles props deterministically on free cells
(not walls, gaps or anything already placed) with `margin` free cells round each. Scatter big things (trees) first;
the build prints `scatter placed N of M` when there was no room, so lower the count. Helpers in `tools/map/helpers.ts`:
`road(points)` (3-wide roads through nodes; a gap's corridor `worldOf(layout).gap(a, b)` is a node), `blob(rect)` (a
rounded patch as rects), `pond(z, rect, { water, shore })` (blob of water, blocked, with a shore), `awayFrom(rects)`
(a `where` filter), `ridge`.

## Assets (`tools/map/catalog.ts`)

- Terrain (`z.paint`, `TERRAINS` in `tools/map/terrain.ts`): `dirt` (paths), `sand`, `meadow`/`darkGrass` (deeper greens),
  `snow`, `mud`, `redDirt`, `ash`/`soot` (undead), `road` (bricks), `pond`, `bog`, `ice` (slippery), `lava`, `pit`/`abyss`;
  and the opaque `coast`/`snowCoast` (land painted over a `sea` fill). Later entries draw over earlier ones, and a full
  tile hides what is under it, so paint the biome's base terrain first and erase it (`{ erase: true }`) under a plaza.
- Ground fills: `grass`, `sand`, `snow`, `water`, `ice`, `stone`, and from the LPC atlas `sea`, `cobble`, `flagstone`, `crackedStone`. `patch(name, rect)` blends sand/snow/stone into grass
  via a ring. **`water` and `ice` rings blend into sand / snow, not grass**: lay a sand (or snow) patch first and put the
  water patch 1 cell inside its fill (the lake in `maps/frostlands.ts`). `snow`/`ice` are recolours (see Biomes in CLAUDE.md);
  re-run `npm run tilesets` after editing `tools/map/recolor.ts`. Water/ice rects are walkable until you `block` the inner cells.
- Interior pieces (`interior.png`, drawn by `tools/map/interior.ts`): ground `planks`, `wall`, `mat`; prefabs `counter` (4x1.5), `shelf<Shop>` (3x2) and `sign<Shop>` (4x2) for each of smithy/armory/ranger/apothecary.
- Prefabs: trees `treeA`/`treeB` (+ `frostTree*`, `dryTree*`, `jungleTree*`, `deadTree*`, `swampTree*`; 3x3, block bottom two rows, top row walk-behind), bushes
  `bush`/`frostBush`/`dryBush`/`jungleBush`/`deadBush`/`swampBush` (2x2), LPC `sandBoulder(B)`/`darkBoulder(B)` (2 wide),
  `sandSpire`/`darkSpire`/`menhir` (1 wide), `reeds` (3 wide)/`reedsThin` (4.5 cells tall: everything they cover must be
  water or wall), `lilyPads`/`lilyFlower`/`lilyFlowerB`/`lilyRed` (on water), rocks `rock` (pale), `rockSmall`, `rockB`, `rockC` (+ `frostRock*`), `barrel`, and
  decorations `flowerRed`/`flowersPurple` (no collision). Mix variants to avoid repetition.
- Buildings (`town.png`, from the CC0 Town RPG Pack, built by `tools/map/town.ts`): `smithy` and `apothecary` are 6x7-cell halls,
  `armory` and `ranger` are 3x9-cell tall houses. Solid from the ground up (you walk around them, not behind). Leave one cell of
  space between neighbours and a cobbled `stone` patch in front looks right (see the square in `maps/town.ts`).
- The tilesets have **no** foliage ground/edge tiles; all vegetation is prefabs. There are no
  inner-corner or non-rectangular patch shapes yet.

### Adding an asset

Look at the sheet first (Read `public/tilesets/<sheet>.png`, crop/zoom with Python+PIL if needed).
Sprites on `object-layer.png` are packed tightly: a bounding box around a canopy usually includes a
corner of its neighbour, so split it into several `parts` that contain only its own pixels, all ending
on the prefab's bottom edge (see `treeA`). Set `solid.band` to the height of the part that should
block (the rest is walk-behind). Render a test zone and zoom in to confirm no bleed. New sheets also
need to exist in `public/tilesets/`.

### Cliffs

Think in cells: for `plateau({col, row, w, h})` the top is cols `col..col+w-1`, rows `row..row+h-1`; the rim occupies row `row-1`, cols `col-1` and `col+w`; the face occupies rows `row+h` and `row+h+1`; the landing in front of stairs is row `row+h+2`. Keep those cells free of forests/props. Check the preview and the `--debug` render that the blocked ring matches the rocks. Plateau art is flat, so nothing is "behind" it; trees south of the face draw over it.

## What the checks mean (`tools/map/check.ts`)

- ✗ two open cells of different `level` touching without stairs (a hole in a plateau rim); a ramp on a blocked cell.
- ✗ spawn/NPC/mob outside the map, on a blocked cell, or unreachable from the spawn; unknown mob kind;
  art reading outside its sheet; JSON out of date.
- ! stairs that don't border a different level. Reachability respects levels: a plateau top is only reachable through stairs. Cliff art is exempt from the foliage check.
- ! open cells unreachable from the spawn (sealed pockets); "player can walk into foliage" (open cell
  ≥50% covered by art, not directly above something solid, so the player would vanish inside a bush);
  "invisible walls" (blocked cell with almost no art and no `block` reason); cells with no ground.

## Zones and doors

Every `maps/<name>.ts` is a zone; the game starts in `greenwood` (`START_ZONE`, `src/main.ts`) and loads others on demand when a player nears a door (`Zones.ensure`). To add a building with an inside: `z.prop(...)` the building, `z.door(...)` on its door cells, and a new `maps/<room>.ts` with `z.indoor()` and its own `z.door` back out (arrival cells must not be doors). The town (`maps/town.ts`, `SHOP_DOORS`) and `tools/map/interiors.ts` (`shopInterior`) are the worked example; a shop room is 11x9 with the keeper behind a counter.

**The biomes** (the open-air world) are laid out in `maps/world.ts`: one character per 7x7-cell square, so every
border between two biomes is shared exactly, plus the list of **gaps**. Each biome is `maps/<name>.ts` with
`defineBiome({ name, walls: { trees }, worldEdge?, build })`, written in *world* cells. You don't draw borders: the
build walls every biome in with 3 cells of its `walls.trees` along each border (and the world's edge, unless
`worldEdge: false`, as the beach closes it with the sea), opens a 3-wide corridor at each gap with doors on both sides
leading straight across, and cuts each biome's map out of the composed world with 14 cells of its neighbours around it
(drawn, blocked). `checkSeams` then fails the build if any border is open on one side only, open without a pair of
doors, or if anything is open on the world's edge. To join two biomes, add a gap `{ at: [squareCol, squareRow], side }`
(keep it at least 3 cells from a turn in the border), then run a `road` into `worldOf(layout).gap(a, b)` on both sides.
To reshape the world, edit the layout's characters; a new biome needs a key letter and a `maps/<name>.ts`.
Door destinations in other zones (`toCol`, `toRow`) are always cells of the destination zone's own map: convert a world
cell with `worldOf(layout).toLocal(zone, col, row)` (the shop rooms use `shopExit` in `maps/town.ts`). Crossing a gap
slides the screen the way the gap goes; rooms use the iris.

## Limits today

- One NPC per zone with fixed dialog (`NPC_LINES` in `src/scenes/OverworldScene.ts`); shopkeepers are per shop room.
- Zones stay loaded once visited; no streaming of one big world.
- Content positions are absolute world cells: changing `square` in `maps/world.ts` means re-placing them.
