# towercraft: a small real-time strategy game on a single road

A separate game on the same site (built into `dist/towercraft/`, see the root `CLAUDE.md`). It shares no code with Me RPG; only
the conventions (Vite, strict TypeScript, Pixi-free rules with unit tests beside them, Prettier, ESLint).

## The game

- **One road, two castles.** One winding road joins player 0's castle (top) to player 1's (bottom). Units walk it from their own castle
  and meet in between. You win by destroying the other castle (or, after `TIME_LIMIT`, by castle health left).
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
- **Fog of war and sight** (`Sight`, `visionOf`, `canSee`, `isSeen`, `isCastleSeen` in `sim.ts`): every castle, tower and unit has a `sight`
  radius (at least its range, detect and aura radius, for a castle its first reach; air units see furthest). A player sees the union of those circles *plus the ground they may build on*.
  The build area (castle reach, tower `reach`) is the permanent, revealed ground and the only place to build; tower and castle sight stay
  while they stand but never allow building; **unit sight is temporary** (gone when the unit dies or walks on) and **never** extends the build
  area. Enemy units, towers and the castle outside every circle are hidden: not drawn, not targeted, not splashed, and a fogged tower stops
  nothing. Any of the owner's sources can spot for the rest. Cloaked units need sight *and* a detector
  (`visibleTo` is the detector half). `ai.ts` asks `isSeen` too (no peeking, though it
  still reasons from the enemy race's roster). `main.ts` draws the fog like Me RPG's underground darkness: a tiny
  canvas, a warm dark fill with soft round pools cut out for each `Sight` (a pool grows over about half a second when a tower goes up and
  shrinks when it falls; a fallen tower's build ground stays faintly lifted), scaled up smooth, plus a cool tint where only sight reaches.
  It hides enemy sprites, bars, rings and shots outside sight. Placing: a hover (mouse) or first tap (touch, with Build/Cancel) shows a
  ghost with range, reach and sight rings; the hint line says why a fogged cell cannot take the tower.
- **Races** differ by how their numbers trade off (`races.ts`): swarm/Goblins (fast, weak, trained in pairs, cheap upgrades), titan/Dwarves
  (slow, strong, costly, long-range towers, tough castle), legion/Germanic (the yardstick). A new race is an entry in `races.ts`.

## Code

- **Rules are Pixi-free and deterministic** (`src/sim/`, an ESLint rule enforces it): `sim.ts` is the whole match, `races.ts` the data,
  `board.ts` the road and castles, `ai.ts` the opponent (seeded, so a match replays). `main.ts` draws a `Match`, owns the camera (drag to
  pan, wheel or pinch to zoom, so a phone can place towers precisely) and turns taps into commands. `?debug` exposes the match and the
  cell-to-screen map to playtest scripts. The same rules can later run on a server for online play.
- **Art** is Wyrmsun's, copied by `tools/towercraftArt.ts` from a clone of its repo (`public/art/CREDITS.md`): animated unit sheets
  (CC-BY-SA 3.0, so the title screen credits them and the terms follow the art), CC0 castles, towers and portraits. Units walk, attack and
  die with the rows Wyrmsun's own scripts use. The field (`lane.png`, an adaptation of the LPC terrain, so also CC-BY-SA) is drawn by Me RPG's
  map pipeline with `npm run towercraft:board`; change the road in `board.ts`, then re-run it.
- Headless screenshots: use `--use-angle=swiftshader`; the older `--use-gl=swiftshader` leaves a transparent band where fixed DOM overlays sit.

## State of play and the plan (StarCraft-style depth, in slices)

Done: the map, castles, queue, upgrades, unit combat, towers, reach, pan and zoom, the AI, the tower roles above (ground, air, area, poison, aura, detector) and fog of war. **Not tuned**: with the AI on both sides most
matches stall to the time limit (it trickles units into towers) and legion loses to both others even with its archers and church. Fix the AI (mass before sending, push
reach forward) and tune with seeded headless matches (as `sim.test.ts` plays them), not by feel.

Next, roughly in order; each is a slice with its own tests:
1. A *beacon* tower (cheap, no attack, big `reach`) to push the build area (fog of war is done).
2. **Detector units** (the observer): a unit that walks with the army and reveals cloaked enemies near it (towers and the castle do it now).
3. **More roles**: slow (a status like poison), armour, a bunker that garrisons units, a siege unit that outranges towers.
4. **Race identity** (each race a different way to play): Goblins swarm, cloak and tunnel; Dwarves long-range siege, bunkers (a tower that
   garrisons units for range and armour) and armour; Germanic the all-round, with air and detection.
5. **Control**: rally points and a hold/attack-move stance, then a second human (online, see below).
6. **Economy**: more than a flat pay (mines to take and hold), once combat is settled.

**Online** (not started) would be two players against a host or server that runs `step`; the open question is a server that decides,
versus peers that agree on a deterministic replay. The sim is built so either works.
