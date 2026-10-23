# towercraft: a small real-time strategy game on roads between castles

A separate game on the same site (`dist/towercraft/`, see the root `CLAUDE.md`). It shares no game code with Me RPG; only
the conventions (Vite, strict TypeScript, Pixi-free tested rules, Prettier, ESLint) and, online, Me RPG's connection layer.

## The game

- **Duels and co-op** (title screen: Duel / 2 v 1 / 2 v 2; design and rules in `src/sim/CLAUDE.md`). A duel is one road between two castles, five maps (`greenwood` the classic and the sim's default, `frostlands` the menu's, `desert`, `mire`, `ember`); units walk it and meet in between. **Co-op**: two on a side against computers, on four maps whose roads fork between three or four camps (your partner is a computer, or a friend online). The map is `Match.board` (`board.ts`): the rules never read a map constant. Destroy the other castle (co-op: all of the other side's) to win, or lead in castle health at `TIME_LIMIT`.
- **The UI shows, it does not tell**: a see-through wood and stone overlay only. The dock shows **only the buildings you can build now**, by kind. **Units and upgrades are bought from buildings' cards** (castle: its base unit; producer: its units; smithy: its upgrades): tap trains one, hold or right-click: the card. Tap a tower on the field for its card. **Touch**: tap a building, drag its ghost, tap *Build* (hold: its stats); press and hold, then drag, to box.
- **Commanding is direct** (`main.ts`, input): a mouse's left-drag boxes, its right or middle drag pans; a finger drags to pan, press-and-hold to box. Pick by tap, box, double-tap (all units), Shift/Ctrl-tap or Ctrl+A; Esc or bare ground lets go. The group card's three stances: **Bunker** (ground ones walk to the nearest with room, or tap one; `garrisonUnits`), **Fight everything** (the default) and **Fight the castle** (`setFocus`, `Unit.focus`; co-op: one per foe castle). Tap or right-click a rival to send the group (`canTarget` refuses the unreachable).
- **Two currencies, wood and stone**: everything costs both. The castle pays `CastleDef.income[level]` every `PAY_EVERY` (5 s); mills (wood) and quarries (stone) (`TowerDef.econ`, `limit` 3) add more; razing one cuts the foe's income. **Purchases are instant**; only money and `UNIT_CAP` (120) limit spam.
- **The castle sells only its base unit; producer buildings unlock the rest** (`UnitDef.needs`, `TowerDef.trains`, `unitUnlocked`, `towerUnlocked`). A building may need another (`TowerDef.needs`) and be limited (`limit`). Up to `PRODUCER_LIMIT` of each; units walk out from these camps. Razing the last locks its units again.
- **Selling** (`sellTower`): from a building's card, 50% back; frees the land.
- **Attack styles** (`UnitDef`): `range` (long range hits across to another run of the road), `splash` (a blast or trample), `multi` (one blow strikes that many foes: a sweep or flame), `suicide` (dies on its first strike, no bounty), `siege` (damage x vs towers and castle), `hitsAir`, `cloak`. Flyers (`air`) follow the road over everything; only air-capable things hurt them.
- **Units leave the road to take a tower** (`detourFor`, `Unit.off`): out of reach from the road, a unit steps off at the road point straight across from the tower (square to the road, never a slant, up to `Match.detourMax` cells; `DETOUR_MAX` in the game), fights, and returns when the tower falls (or the unit is sent at the castle).
- **Orders are per unit** (`setFocus`, the group card; no player-wide switch): a unit or group keeps its order until it is told another or dies; a unit with none fights everything (the default, and what a new unit starts with). The castle is always attacked once in reach.
- **Defence**: towers shoot units only. *Attackers* hit `ground`, `air` or `both` (`splash`, poison `dot`); *auras* `power` (at most double) or `heal`; *detectors* reveal cloaked units; **bunkers** (`TowerDef.bunker`) are loaded by `loadBunker` with ONE ground soldier per slot for its share of the price; a ranged one shoots with range+`rangeBonus`, a melee one strikes foes at the walls (`BUNKER_GUARD`); upgrades apply; it falls with it. `damage: 0` never shoots.
- **Upgrades** (`UpgradeDef`): one tap buys, the price on the button; per race ground/air x damage/health, three levels of +15% (`boostOf`), bought at a smithy-type building (`buyUpgrade`, instant). Health applies to units bought later (`Unit.maxHp`); damage at once.
- **Build area and fog of war** (`inBuildArea`, `visionOf`, `canSee`, `isSeen`; in `src/sim/CLAUDE.md`): you build only on ground your castle or a tower sees, never within `FOE_CLEAR` of a foe's castle; castle upgrades ask for defence towers; hidden enemies are not drawn, targeted or splashed.
- **Look** (`main.ts`, cosmetic): units at `SIZE` x2, in their race's colour (`teamColor.ts`: other hues for further seats; purple on sheets, castles and towers is recoloured); walk, strike, tower fx, pay-day figures. No sparkles.
- **Sound**: `src/CLAUDE.md`.
- **Buildings grow with upgrades** (`trim.ts`, cosmetic, drawn by `drawTrim` from `Match` state): castle size, pennants and a top-level ring; a smithy's pennant and size.
- **Hurt and falling buildings** (`wreck.ts`, cosmetic): smoke, flames, then a razed building sinks with dust.
- **Races** (`races.ts`): swarm/Goblins, titan/Dwarves, legion/Germanic: 4-6 ground and 2-3 air units each.

## Online

The title screen's **Solo / Host / Join** picks solo (the AI) or a game with a friend over Me RPG's relay and peer-to-peer link: lockstep, so `src/sim` must stay exact. Design and rules in `src/net/CLAUDE.md`.

## Code

- **Rules are Pixi-free and deterministic** (`src/sim/`, enforced by ESLint): `sim.ts` the match, `races.ts` the data, `board.ts` the maps, `ai.ts` the seeded opponent, `testkit.ts` test helpers. `main.ts` draws a `Match`, owns the camera and turns taps into commands.
- **Art** is Wyrmsun's, copied by `tools/towercraftArt.ts` from a clone of its repo (`public/art/CREDITS.md`): unit sheets CC-BY-SA 3.0, CC0 castles, towers, buildings. Every map is `GROW` (2) x the 36x55 grid the roads were drawn on (72x110 cells plus `EDGE` (8) open columns each side; `greenwood` 111 rows so its middle run sits on a row; `Board.cols/rows` drive the camera and fog). **Distances are stretched too**: `races.ts` is written for the small grid; `RACES` has tower and castle ranges, reaches, sights, radii and unit speeds times `REACH_SCALE` (1.5); unit attack ranges are NOT stretched (balance). Unit tests play `DRAWN_RACES` on the drawn field (`testkit.ts`; `Match.races`/`detourMax`). Scenery is sparse (it blocks building). **Art loads lazily** (`prefetch`, `ensureAssets`). Fields (`art/maps/<id>.png`) come from `npm run towercraft:board [-- <id>]` (`tools/towercraftBoard.ts`), which also writes `src/sim/scenery.ts`; roads are `src/sim/road.ts`. **A new map** is a `ROADS` entry, a `THEMES` entry and a generator run; `board.test.ts` checks fairness. `greenwood` and the two-against-two fields are turned half way round onto themselves.

## State of play

**Balance is StarCraft's** (`tools/towercraftScale.ts`: each unit has an SC analog; its stats and price come from one conversion, so races are like-for-like and one income fits all; change the table, then re-run it). Buildings keep up with `DEFENCE_DAMAGE` / `BUILDING_HP` in `races.ts`. The lab (`npm run towercraft:lab`, `:coop`, `:balance`) judges only the AI against itself: do not tune to it. Castle levels are swept by `techtree.test.ts`.

**The AI** (`Style` from its seed): mills and quarries first, tech, waves of at least `MIN_WAVE` units (bombs against towers, sweeps against crowds, archers against air), upgrades, loaded bunkers, castle levels, towers as far forward as they see road, sends units that have no order at the castle when it could kill it fast. It reads the foe only through `foeUnits`, `foeTowers`, `foeCastle`.

Next: a *beacon* tower; detector units; slow, armour; rally, attack-move; online leave; spectating.
