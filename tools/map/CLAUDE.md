# tools/map and maps/: the map pipeline

Maps are built from code, not painted. **Use the `build-zone` skill for any map change** (it has the builder API, the
catalog and the pitfalls checklist). Never hand-edit `public/maps/*.json`; `npm run map -- build` compiles
`maps/<zone>.ts` into it and runs `check.ts`, and `npm run build` fails when the JSON is stale or a check errors.

## Shape of the pipeline

- A zone spec uses the `Zone` builder (`zone.ts`) with named assets from `catalog.ts` and writes a packed `MapData`
  (`src/map/types.ts`: ground cells over shared tilesets, y-sorted free-placed objects with a `tag`, a collision cell
  list, per-cell metadata such as `surface` and `level`, spawn and door cells). The game's `MapView` and the previews in
  `image.ts` draw it the same way. All art is cut on a 32 px grid; tilesets are in `public/tilesets/`, some derived
  (recoloured) by `recolor.ts`, trees cut from the LPC pack by `trees.ts` (`treeAtlas.ts` is generated).
- **Collision follows the art**: a prop blocks the cells its solid band covers (`Prefab.solid`); forests and woods block
  where their art covers; a prop flagged `movable` (barrels) blocks no cell, because it is a body in play. Don't
  `block()` props by hand.
- **Terrain is autotiled on cell corners** (`z.paint`, from the LPC terrain atlas), so any shape blends. Biome ground
  uses `z.ground`, which stops short of borders so grounds never meet in a straight line.

## The world

`maps/world.ts` lays the open-air world out in squares; each biome (`maps/<name>.ts`, `defineBiome`) builds in world
cells. `buildWorld` walls every border, cuts a corridor with a door either side at each gap, composes one world and
cuts each biome's map from it: **its own cells plus a margin of its neighbours' (surface `beyond`, blocked)**. The game
does not draw the margin in this zone's view; it lays the neighbour's own map beside it (see `src/scenes/CLAUDE.md`).
Consequences that bite: objects in the margin exist in this map's data too (anything that treats map objects as "mine"
must skip `beyond` cells), and the margin is how two maps line up.

## What the checks enforce (and why)

- **Borders match** (`checkSeams`): both sides blocked, or both doors straight across; nothing open on the world edge.
- **No invisible walls**: every blocked cell has art over it; a border row always shows a tree, bush or rock.
- **Jarring ground fails the build** (`ground.ts`): a hard colour seam on a cell boundary, or one surface in two shades.
  A biome's ground is a palette of at most two close colours joined by a soft edge, never a bare rect.
- **Heights** (`z.plateau`): open cells of different level must meet only across stairs; a plateau's top is the ground
  its rim is drawn with.
- **Doors and crossings** (`checkDoors`, `checkCrossings`): every door has a way back and an open arrival, and a real
  collision box can walk through every crossing and on, so no crossing drops a player into a pocket.
- **Content tie-ins**: placements, chests' loots, crops, sites, signs and a shopkeeper's shop are checked against the
  campaign that draws the map (`src/content/CLAUDE.md`), so a pack's rooms run the packs' shops.

## Signs

Signposts (`z.sign`, alternating `signpost`/`signpostB`), notice boards and the hanging shop signs (`hang*`, a prefab with
`wall: true`, drawn in front of the wall it hangs on: put one a cell up beside a door, nudged `dy: -6`) are OpenGameArt
sheets used unmodified (`SIGN_PREFABS` in `catalog.ts`, credit in `art/oga_signs/`). Only a signpost's post blocks. A signpost's `ways` are authored hints: the game reads the real neighbours (`systems/signs.ts`).

## Shop buildings

`town.png` (`town.ts`, from the CC0 Town RPG Pack in `art/`) holds the shop prefabs (`BUILDINGS` in `catalog.ts`),
solid from the ground up; each has a door into its interior room (`interiors.ts`).

## Ruins

`ruins.png` (`ruins.ts`, from the OGA-BY/CC-BY "[LPC] Jungle Ruins", not kept in the repo: `RUINS_DIR=<unzipped pack> npm run ruins`)
holds the `ruin*` prefabs (`RUIN_PREFABS` in `catalog.ts`): a pyramid, temple, hall, hut, walls, an arch, pillars, idols and rubble.
Buildings and walls are solid from the ground up; pillars and idols block along their whole height; the arch blocks only
its dark half, so its open half is a gate. They are scenery, not enterable. Used in the jungle, desert, undead lands and
the Wilds' old shrine and barrow; the quest `ruin` landmark (`entities/Landmark.ts`) is drawn from the same sheet.
