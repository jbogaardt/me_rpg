# towercraft: a small real-time strategy game on a single road

A separate game on the same site (built into `dist/towercraft/`, see the root `CLAUDE.md`). It shares no code with Me RPG; only
the conventions (Vite, strict TypeScript, Pixi-free rules with unit tests beside them, Prettier, ESLint).

## The game

- **One road, two castles, five maps.** One long winding road (36x55 cells, 175-225 long, units walk 2-6 cells a second) joins player 0's castle to player 1's; units meet in between. The player picks the map on the title screen, above the race (kept in `localStorage` as `towercraft:map`): `greenwood` (the original straight switchbacks), `frostlands`, `desert`, `mire` (swamp) and `ember` (zigzags between lava), each drawn in the look of the Me RPG biome of that name. The map lives in `Match.board` (`Board` in `board.ts`: road, castles, `roadCells`, `sceneryCells`, `pointAt`, `headingAt`), so the rules never read a map constant. You win by destroying the other castle (or, after `TIME_LIMIT`, by castle health left).
- **The dock and the card** (Me RPG's menu kit: gold frames over wood and parchment, Cinzel and Crimson; `index.html`): the bottom dock is small thumbnails to train, build and command (price under each, `L2` if the castle is too low); tap one and a *card* pops up at the side (above the dock on a narrow screen) with its stats and the purchase button (Train; Build, which arms placement; Upgrade for the castle card, also opened by tapping the castle). The order toggles sit by the castle thumbnail.
- **Orders** (`Orders`, `setOrder`): a player's units either stop and fight the towers and units they meet (`attack`) or walk on past (`bypass`), chosen separately; the castle is always attacked once in reach.
- **Everything comes from the castle**: pay for a unit, it joins the train queue, walks out and marches on its own. The levers are what you train, where you build, and the orders.
- **Towers defend**: they shoot enemy units only. Units attack units, towers and castles.
- **Tower roles** (`TowerDef`): *attackers* hit `ground`, `air` or `both`, maybe with `splash` or poison (`dot`, renews, never stacks); *auras* `power` (+% damage, at most double) or `heal` friends and fire nothing; *detectors* (`detect`) reveal cloaked enemies. `damage: 0` never shoots.
- **Unit traits** (`UnitDef`): `air` units fly the straight line between castles and only air-capable things (`hits` air/both towers, `hitsAir` units, the castle) hurt them; `cloak` units are untargetable unless `visibleTo` finds a detector (or the castle's sight) near.
- **Build reach**: towers go on free cells inside the castle's reach (6, 9, 13 by level) or a built tower's `reach`, so a front line is pushed forward tower by tower. Castle upgrades unlock tier 2-3 units and towers, pay and health.
- **Fog of war and sight** (`visionOf`, `canSee`, `isSeen`, `isCastleSeen`): castles, towers and units have a `sight` radius; a player sees those circles plus the ground they may build on. The build area is permanent revealed ground and the only place to build; tower and castle sight last while they stand; **unit sight is temporary** and never extends the build area. Enemies outside every circle are hidden: not drawn, targeted or splashed; cloaked ones need sight *and* a detector. The AI reads the foe through vision too. `main.ts` draws the fog like Me RPG's underground darkness (a tiny canvas scaled up smooth). Placing shows a ghost with range, reach and sight rings (hover, or a first tap with Build/Cancel); the hint line says why a cell is refused.
- **Everything that fights is drawn at twice its old size** (`SIZE` in `main.ts`) so it stands in proportion to the roads; the road is three cells wide on every map (`halfWidth` in `road.ts`).
- **Animation** (`main.ts`, all cosmetic, read from the sim's `Shot.by`): a unit walks (frames follow the distance walked, five directions along the road's tangent), stands (breathing), flaps if it flies, and for `STRIKE_TIME` after a blow faces its target and plays its attack frames with a lunge (melee) or recoil (shot); missiles fly. A tower breathes, kicks back and flares a lamp when it fires; healers and power towers breathe a halo, detectors sweep (`makeTowerFx`, `animateTower`). Keep it quiet: no sparkles.
- **Races** differ by how their numbers trade off (`races.ts`): swarm/Goblins (fast, weak, trained in threes, cheap upgrades), titan/Dwarves
  (slow, strong, costly, long-range towers, tough castle), legion/Germanic (the yardstick). A new race is an entry in `races.ts`.

## Code

- **Rules are Pixi-free and deterministic** (`src/sim/`, an ESLint rule enforces it): `sim.ts` is the whole match, `races.ts` the data,
  `board.ts` the road and castles, `ai.ts` the opponent (seeded, so a match replays). `main.ts` draws a `Match`, owns the camera (drag to
  pan, wheel or pinch to zoom, so a phone can place towers precisely) and turns taps into commands. `?debug` exposes the match and the
  cell-to-screen map to playtest scripts. The same rules can later run on a server for online play.
- **Art** is Wyrmsun's, copied by `tools/towercraftArt.ts` from a clone of its repo (`public/art/CREDITS.md`): animated unit sheets
  (CC-BY-SA 3.0, so the title screen credits them and the terms follow the art), CC0 castles, towers and portraits. The fields (`art/maps/<id>.png`, adaptations of the LPC terrain, so also CC-BY-SA) are drawn by Me RPG's
  map pipeline with `npm run towercraft:board [-- <id>]` (`tools/towercraftBoard.ts`: one `Theme` per map, the biome's ground, trees, bushes and rocks), which also writes `src/sim/scenery.ts` (the cells woods, lakes and rocks cover on each map: nothing is built there); the roads are `src/sim/road.ts` (`ROADS`: a straight-run list, or control points for player 0's half that `meander` smooths and turns), then re-run it. **A new map** is a `ROADS` entry, a `THEMES` entry, a run of the generator and a run of `board.test.ts` (it checks the road, the symmetry, clear ground and that two AIs finish a game on it).
  Every field turns half way round onto itself (road, scenery, castles), so neither side has better ground: keep it so. The UI kit is Me RPG's (`public/ui/`, copied from `src/ui/`).
- Headless screenshots: `--use-angle=swiftshader`.

## State of play and the plan (StarCraft-style depth, in slices)

Done: five maps, castles, queue, upgrades, combat, towers, reach, pan and zoom, roles, fog, orders, the card UI, animation, a balance pass.

**Balance** is measured: `npm run towercraft:balance [-- N [seedBase]]` (`tools/towercraftBalance.ts`; `TOWERCRAFT_MAP=<id>` for another map) plays seeded
AI-against-AI matches (mirrors included, sides alternating) and prints wins per side, pairing and race, length and what the AI built. Re-run it after changing
`races.ts`, `ai.ts` or `sim.ts` constants (a sample of 40 swings about 8 points: judge by N of 100 or several seeds). `balance.test.ts` is a guard only.
Last measured (greenwood, fog, N 100): every match decisive, median about 6 min; every pairing 41-58%, mirrors top side 38-58%. Levers: pay, castle hp, unit
hp and count, speed, splash. Thieves are touchy. **Miss:** Goblin games are short.

**The AI** (`ai.ts`; a `Style` drawn from its seed, since two equal armies cancel): buys units in **waves**, **upgrades** on a schedule, adds towers **as far forward as they still see road**, builds a **detector**/**shooter** once the foe fields cloaked/air, walks **past towers** when its army could kill the castle in seconds, **past units** when it would win that race, and always after its `rush` time. It reads the foe only through `foeUnits`, `foeTowers` and `foeCastle` (vision).

Next, roughly in order: a *beacon* tower (cheap, big `reach`); **detector units**; **more roles** (slow, armour, bunker, siege); **race identity**
(Goblins swarm and tunnel, Dwarves siege and armour, Germanic all-round); **control** (rally points, attack-move, a second human online); **economy** (mines).
