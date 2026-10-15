# src/scenes: the overworld, zones and doors

`OverworldScene` is only the conductor: the frame loop, the HTML overlays (menu, dialog, shop counter, trade window,
map) and what the action key does on the spot (talk, open a chest, pick up, otherwise attack). **Put new code in the file
that owns the concern, not in the scene.** The files in `overworld/` carry headers that say what each owns: `Arena` (who is
in the game, the loaded zones, the zone context), `Zones` (loading, prefetching, travel, transitions), `Simulation` (the
rules), `Visuals` (everything drawn from an event), `Ground`, `PackSync`, `Trading`, `HostLink`/`GuestLink` (the two sides
of the network protocol), `Training`, `Casting`, `Story`, `Scenario`. A new rule belongs in `Simulation`, a new thing to
draw in `Visuals`, a new synced thing in the matching link. The DM's controls are in `docs/dungeon-master.md`, spells in
`src/systems/CLAUDE.md`.

## Design

- **Solo and host run the one authoritative simulation; a guest only draws.** Each frame the scene reads
  `Session.role` (`solo`/`host`/`client`). Rules live in `Simulation`/`Casting`/etc.; what a friend should see goes out
  through the simulation's `emit` (events) or the snapshot. Solo, a dialog freezes the world and the menu pauses it;
  online the world never pauses.
- **The rules are written once and serve every zone.** `arena.zone` is the zone being worked in; a per-zone loop wraps
  its work in `arena.inZone(z, ...)`, so `arena.mobs`, `.collision`, `.chests`, `.players()` answer for that zone. Only
  zones with a player in them are simulated, so a shop nobody is in costs nothing.
- **A zone is one `MapData` plus everything alive in it** (`ZoneState`): view, collision, mobs, chests, keepers, crops,
  barrels, ground items, effects. Players belong to no zone object; each `Player` names its zone.
- **Memory stays bounded.** Zones load on demand, doors prefetch the zone behind them, and a zone nobody is near is
  unloaded after a while (`Zones.retire`). What must outlast it (opened chests, ground items, crops, ponds, moved
  barrels) is kept in `Arena.memory` (`ZoneMemory`); its mobs start afresh. Add to `ZoneMemory` when a new thing must
  survive.

## Doors and the one world

- **Walking across a gap between two open-air zones is not a transition.** The zones are laid out like one map
  (`neighbourLinks`): the joined zones are drawn beside the player's own, nested in its world and sharing its camera,
  layered so every zone's ground is under everyone's trees. Crossing only changes which map the player is in; the new
  camera adopts the exact screen position, so nothing moves. A zone seen from next door is a lookout (weather hidden,
  mobs kept wandering on host/solo, hidden on a guest).
- **Everything else (a shop or cave door, a trial, waking after a defeat) is the iris**, one look (`map/transition.ts`,
  `entities/ZoneTransition.ts`). **Do not add another look**: a new door either joins two open-air zones by a gap or uses
  the iris. It is drawn as a thick stroke, not a rectangle with a `cut()` hole: a hole crossing the rectangle's edge
  draws solid black and flashes the screen.
- Travel gives a short silent immunity (`Player.grace`) because the world runs behind the transition. The transition is
  purely visual: the simulation moved the player at once, so solo, host and guest behave the same.
- **Co-op**: players can be in different zones. The host simulates every occupied zone and sends each friend a snapshot of
  *their* zone only (plus `away`, so absent players are not mistaken for having left); a guest that finds itself in a
  new zone loads it, plays the same transition and re-places the others. Events carry their zone.
- Map checks (`checkDoors`, `checkCrossings`, in `tools/map/CLAUDE.md`) guarantee every door has a way back and no
  crossing drops a player into a pocket.
