# tools/map and maps/: the map pipeline

Maps are built from code, not painted. **Use the `build-zone` skill for any map change** (it has the builder API, the
catalog and the pitfalls checklist). Never hand-edit `public/maps/*.json`; `npm run map -- build` compiles
`maps/<zone>.ts` into it and runs `check.ts`, and `npm run build` fails when the JSON is stale or a check errors.

## Shape of the pipeline

- A zone spec uses the `Zone` builder (`zone.ts`) with named assets from `catalog.ts` and writes a packed `MapData`
  (`src/map/types.ts`: ground cells over shared tilesets, y-sorted free-placed objects with a `tag`, a collision cell
  list, per-cell metadata such as `surface` and `level`, spawn and door cells). The game's `MapView` and the previews in
  `image.ts` draw it the same way. All art is cut on a 32 px grid; tilesets are in `public/tilesets/`, some derived
  (recoloured) by `recolor.ts`, trees cut from the LPC pack by `trees.ts` (`treeAtlas.ts` is generated; kinds green, frost, dry, jungle, dead, swamp and autumn, the last used by the marches pack's Harvestwood).
- **Collision follows the art**: a prop blocks the cells its solid band covers (`Prefab.solid`); forests and woods block
  where their art covers; a prop flagged `movable` (barrels) blocks no cell, because it is a body in play. Don't
  `block()` props by hand.
- **Terrain is autotiled on cell corners** (`z.paint`, from the LPC terrain atlas), so any shape blends. Biome ground
  uses `z.ground`, which stops short of borders so grounds never meet in a straight line.

## The world

`maps/world.ts` lays the open-air world out in squares (extend it east or south only: biome-local cells count from each biome's north-west corner, so growing west or north would move every map); each biome (`maps/<name>.ts`, `defineBiome`) builds in world
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

Signposts (`z.sign`, alternating `signpost`/`signpostB`), notice boards and hanging shop signs (`hang*`, `wall: true`: one a cell up beside a door, nudged `dy: -6`) are OpenGameArt
sheets used unmodified (`SIGN_PREFABS` in `catalog.ts`, credit in `art/oga_signs/`). Only a signpost's post blocks. A signpost's `ways` are authored hints: the game reads the real neighbours (`systems/signs.ts`), and on a biome the check fails a way naming a zone that no gap door on that side reaches. Give a town or haven a notice board and a hanging sign by each shop, hall or inn door; graves and ruins go in clearings off the roads (keepClear them).

## Shop buildings

`town.png` (`town.ts`, composed from the LPC City outside pack in `art/lpc_city/`) holds the shop prefabs (`BUILDINGS` in `catalog.ts`),
solid from the ground up; each has a door into its interior room (`interiors.ts`). Halls are 5 cells wide with a one-cell door, houses 3; a
shop is told by its hanging sign, not its colour. Six shops stand in Lanternrest; the tavern (the Resting Lantern) is where a party rests.
A new shop is a hall or house in `town.ts`, a `SHOP_DOORS` entry, a room spec, a shelf and sign in `interior.ts`, and its shop, keeper and
node in the content. `interior.png` (`interior.ts`, from LPC floors, furniture and the City wall in `art/lpc_interior/`) holds the room
pieces (`INTERIOR` in `catalog.ts`); `compose.ts` has the cut and overlay helpers `town.ts` shares.

## Rock plateaus

`z.plateau(rect, { kind: 'rock', stairs })` raises a mesa cut from the LPC mountains (`ROCK_SHEET`): cobble top, brown face, a cobble ramp at
each stair column. It draws its own top, so it sits on cave floor, dirt or sand alike; collision and levels are shared with the other
cliffs (`plateauSolid`). The Sunscar Hollow has one. Mobs ignore heights for now: keep placements off the face rows.

## Ruins

`ruins.png` (`ruins.ts`, from the OGA-BY/CC-BY "[LPC] Jungle Ruins", not kept in the repo: `RUINS_DIR=<unzipped pack> npm run ruins`)
holds the `ruin*` prefabs: pyramid, temple, hall, hut, walls, arch, pillars, idols, rubble.
Buildings and walls are solid from the ground up; pillars and idols block along their whole height; the arch blocks only
its dark half, so its open half is a gate. Scenery, except the arches of the jungle and desert temples and the jungle hall (doors into `maps/ruin_*.ts`, `ruinRooms.ts`); `Prefab.foot` sorts a building on its wall's base, not its pillars'. Used in the jungle, desert, undead lands and
the Wilds' old shrine and barrow. The quest `ruin` landmark (`entities/Landmark.ts`) uses the same sheet.

## Landmarks

`landmarks.png` (`landmarks.ts`, `npm run landmarks`; two CC-BY-SA LPC packs, not kept in the repo, see CREDITS.md) holds the pixel art of the quest landmarks: well, wagon, campfire flames, tent, hut, statue, and the church, bell tower and watchtower composed from the City pack's walls, spires and doors. `src/systems/landmarkAtlas.ts` is generated; `Landmark.ts` draws only from sheets.

## Caves and sewers

Underground rooms are indoor zones (`z.indoor()`, so no seam check) painted from a grid by `delve.ts`: a spec makes a `Delve`, carves chambers, tunnels and pools into solid rock, and `paint` shows each rock cell by its distance to the open floor south of it (wall face, second face row, rim, then plain dark roof; the view is from the south, so only that side of a wall is seen). A wall needs two rows of rock for its whole face: carve rooms that far apart. Themes `cave`, `rock` and `sewer` name the grounds (`dungeonGrounds` in `catalog.ts`); `cave` is MrBeast's CC-BY 3.0 tileset (`art/oga_dungeon/`, doubled by `dungeonSheets.ts`), `rock` and `sewer` are cut from the LPC base assets by `rockCave.ts` and `sewerLpc.ts` (with the sewer's props). Campaign 1 stacks them: the Hollow leads to the Sunscar Depths, a sewer to the Undercroft, the graveyard's tomb to the Barrow Deep (foes banded 9 to 22). Caves and sewers are core engine (just a map and doors); who lives there is content (a scenario node per zone, one biome entry linking back). A doorway to the open air is in `delves.ts` (both ends read it); its overworld end is a prop (`caveMouth`, `sewerHatch`) with a door. Their ground names sit last in `SURFACES` (`zone.ts`) so the open-air maps' surface indices never move.

## Camps

`camp.ts` lays a wayfarers' camp (content layer, no new engine rule; shops are host-owned as ever): tent, hut, well, cart, fire and a quartermaster from the landmark art (`CAMP_PREFABS`, `landmarks.png`). The content keeps foes out with each roam rule's `avoid`, and each camp sells wares no other shop does.
