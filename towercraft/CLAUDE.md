# towercraft: a small real-time strategy game on a single road

A separate game on the same site (built into `dist/towercraft/`, see the root `CLAUDE.md`). It shares no code with Me RPG; only
the conventions (Vite, strict TypeScript, Pixi-free rules with unit tests beside them, Prettier, ESLint).

## The game

- **One road, two castles.** One long winding road (36x55 cells, about 220 long, units walk 2-6 cells a second) joins player 0's castle (top) to player 1's (bottom); units meet in between. You win by destroying the other castle (or, after `TIME_LIMIT`, by castle health left).
- **The castle panel** (tap your castle): level, health, pay, build reach, the training queue, and the next upgrade with its cost, what it gives
  and unlocks, and the Upgrade button.
- **Orders** (`Orders` in `sim.ts`, set per player with `setOrder`, toggles in the control bar): all of a player's units either stop and fight the
  towers and the units they meet (`attack`), or walk on past them (`bypass`), each chosen separately; the castle is always attacked once in reach.
- **Everything comes from the castle**: pay for a unit and it joins the castle's train queue, then walks out and marches on its own,
  fighting whatever is in reach (units, towers, the castle). The levers are what you train, where you build, and those orders.
- **Towers defend, they do not attack towers**: they shoot enemy units only. Units attack units, towers and castles.
- **Tower roles** (`TowerDef` in `races.ts`; each race has a few of each): *attackers* hit `ground`, `air` or `both`, and may do area damage
  (`splash`) or poison (`dot`, which renews, never stacks); *auras* strengthen (`power`, +% damage) or `heal` friendly towers, units and
  the castle round them, and fire nothing; *detectors* (`detect`) reveal cloaked enemy units to the owner's towers and castle. A tower with
  `damage: 0` never shoots. Power auras add up to at most double damage.
- **Unit traits** (`UnitDef`): `air` units fly the straight line between the castles over everything, and only things that can hit air
  (`hits` air/both towers, units with `hitsAir`, the castle) can hurt them; `cloak` units cannot be seen, so not targeted, unless
  `visibleTo` finds a detector of the other side near (or the castle's own sight); archers and gryphons shoot the air.
- **Build reach**: towers go on free cells inside the castle's reach (6, 9 then 13 cells by castle level) or inside the reach of a tower
  already built (`TowerDef.reach`), so a front line is pushed forward tower by tower. Upgrading the castle also unlocks tier 2 units and
  towers, more pay and more castle health.
- **Fog of war and sight** (`visionOf`, `canSee`, `isSeen`, `isCastleSeen` in `sim.ts`): castles, towers and units each have a `sight` radius (at
  least their range, detect and aura radius). A player sees those circles plus the ground they may build on. The build area (castle reach, tower
  `reach`) is the permanent revealed ground and the only place to build; tower and castle sight stay while they stand but never allow building;
  **unit sight is temporary** (gone when the unit dies or walks on) and **never** extends the build area. Enemy units, towers and the castle
  outside every circle are hidden: not drawn, not targeted, not splashed. Cloaked units need sight *and* a detector. The AI reads the foe only through
  vision too. `main.ts` draws the fog like Me RPG's underground darkness (a tiny canvas, a warm dark fill with soft pools cut out, scaled up smooth;
  a pool grows over half a second when a tower goes up). Placing: a hover (mouse) or first tap (touch, with Build/Cancel) shows a ghost with
  range, reach and sight rings; the hint line says why a cell cannot take the tower.
- **Races** differ by how their numbers trade off (`races.ts`): swarm/Goblins (fast, weak, trained in threes, cheap upgrades), titan/Dwarves
  (slow, strong, costly, long-range towers, tough castle), legion/Germanic (the yardstick). A new race is an entry in `races.ts`.

## Code

- **Rules are Pixi-free and deterministic** (`src/sim/`, an ESLint rule enforces it): `sim.ts` is the whole match, `races.ts` the data,
  `board.ts` the road and castles (a `Board`; a match carries its own, `Match.board`, and the rules read that, never a constant: the game plays `DEFAULT_BOARD`), `ai.ts` the opponent (seeded, so a match replays). `main.ts` draws a `Match`, owns the camera (drag to
  pan, wheel or pinch to zoom, so a phone can place towers precisely) and turns taps into commands. `?debug` exposes the match to playtest scripts. The same rules can later run on a server.
- **Art** is Wyrmsun's, copied by `tools/towercraftArt.ts` from a clone of its repo (`public/art/CREDITS.md`): animated unit sheets
  (CC-BY-SA 3.0: the title screen credits them), CC0 castles, towers and portraits. The field (`lane.png`, an adaptation of the LPC terrain, so also CC-BY-SA) is drawn by Me RPG's
  map pipeline with `npm run towercraft:board`, which also writes `src/sim/scenery.ts` (the cells woods, lakes and rocks cover: nothing is built there); the road is `src/sim/road.ts`, then re-run it.
  The field turns half way round onto itself (road, scenery, castles), so neither side has better ground.
- Headless screenshots: `--use-angle=swiftshader`.

## State of play and the plan (StarCraft-style depth, in slices)

Done: map, castles, queue, upgrades, combat, towers, reach, pan and zoom, tower roles, fog, orders, a balance pass.

**The lab** (`npm run towercraft:lab -- --help`, `tools/towercraftLab.ts`; not part of the game): headless AI-against-AI matches over maps (`maps.ts`) x races x
strategies (`STRATEGIES` in `ai.ts`, or `--define`), with win rates and 95% intervals, a CSV row per match (`--out`) and what-if overrides on the race data
(`--set swarm.units.glider.hp=*1.2`). Sim constants are edited in source; one road only. Use n of 100+.

**Balance** is measured: `npm run towercraft:balance [-- N [seedBase]]` (`tools/towercraftBalance.ts`) plays seeded AI-against-AI matches (N per
pairing, mirrors included, sides alternating) and prints wins per side, pairing and race, length and what the AI built. Re-run it (or the lab) after changing `races.ts`, `ai.ts` or `sim.ts` constants. `balance.test.ts` is a guard only. Last measured (N 100): all decisive, median about 6 min (Goblins 4.5); pairings 40-58%.
Goblins once lost every game (0% vs Dwarves): fixed with sturdier threes, a stronger glider and castle, and dearer, lighter Dwarf units and castle. Levers: pay, castle hp, unit hp and count, speed, splash. **Miss:** Goblin games are short.

**The AI** (`ai.ts`; a `Style` drawn from its seed, because two equal armies cancel and never end a match): buys units in **waves** (all its gold at
once, slowest first; the queue is all the holding there is), **upgrades** on a schedule, adds towers with time **as far forward as they still see road**,
builds a **detector** against cloaked and a **shooter** against air once the foe fields them, walks **past towers** when its army could kill the castle
in seconds, **past units** when it would win that race, and always after its `rush` time. It reads the foe only through `foeUnits`, `foeTowers` and
`foeCastle`, which show only what its vision shows.

Next, roughly in order (each a slice with its own tests):
1. A *beacon* tower (cheap, no attack, big `reach`) to push the build area.
2. **Detector units** (the observer): a unit that walks with the army and reveals cloaked enemies (towers and castles do it now).
3. **More roles**: slow (a status like poison), armour, a bunker that garrisons units, a siege unit that outranges towers.
4. **Race identity**: Goblins swarm, cloak and tunnel; Dwarves siege, bunkers and armour; Germanic the all-round with air and detection.
5. **Control**: rally points and attack-move, then a second human (online: a host or server that runs `step`).
6. **Economy**: more than a flat pay (mines to take and hold), once combat is settled.
