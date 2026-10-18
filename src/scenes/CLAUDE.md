# src/scenes: the overworld, zones and doors

`OverworldScene` is only the conductor: the frame loop (a short `update` of named steps) and the HTML overlays (menu,
dialog, shop counter, trade window, map). **Put new code in the file that owns the concern, not in the scene**; a lint
rule caps the file's length. What the action key does is `Interactions`, the controls are `LocalInput`, what the local
player is told about quests is `StoryUi` (local only, nothing on the wire). The files in `overworld/` carry headers that say what each owns: `Arena` (who is
in the game, the loaded zones, the zone context), `Zones` (loading, prefetching, travel, transitions), `Simulation` (the
rules), `Visuals` (everything drawn from an event), `Ground`, `PackSync`, `Trading`, `HostLink`/`GuestLink` (the two sides
of the network protocol), `Training`, `Casting`, `Story`, `Scenario`, `Persistence`, `Interactions`, `LocalInput`, `StoryUi`, `PartyUi`. A new rule belongs in `Simulation`, a new thing to
draw in `Visuals`, a new synced thing in the matching link. The DM's controls are in `docs/dungeon-master.md`, spells in
`src/systems/CLAUDE.md`.

## Design

- **Solo and host run the one authoritative simulation; a guest only draws.** Each frame the scene reads
  `Session.role` (`solo`/`host`/`client`). Rules live in `Simulation`/`Casting`/etc.; what a friend should see goes out
  through the simulation's `emit` (events) or the snapshot. Solo, a dialog freezes the world and the menu pauses it;
  online the story is the Dungeon Master's alone (the map's quest givers and chapters are solo only, `docs/dungeon-master.md`), and the world only stands still while someone reads a quest conversation (`ReadingPause`, see `src/net/CLAUDE.md`).
- **The rules are written once and serve every zone.** `arena.zone` is the zone being worked in; a per-zone loop wraps
  its work in `arena.inZone(z, ...)`, so `arena.mobs`, `.collision`, `.chests`, `.players()` answer for that zone. Only
  zones with a player in them are simulated, so a shop nobody is in costs nothing.
- **A zone is one `MapData` plus everything alive in it** (`ZoneState`): view, collision, mobs, chests, keepers, crops,
  barrels, ground items, effects. Players belong to no zone object; each `Player` names its zone.
- **Sword input buffer** (`systems/inputBuffer.ts`; core engine, host-owned): `Simulation.attack` called inside the cooldown
  keeps the press for `ATTACK_BUFFER_S` (0.16 s) and `updatePlayer` fires it on the first tick the cooldown allows (bows,
  wands and tomes share the same gate and cooldown values). One pending press per `Player.attackBuffer`; a newer press
  refreshes it; it dies on fire, a dialog or menu (`Interactions.holdAttack`), a fall, or a zone change. Holding the action
  key (`Command.held`, the on-screen A button too: both are `actionDown('attack')`) refreshes it each tick but only where
  the key means attack (`Interactions.fighting`: a foe within 10 cells), so holding by an NPC, chest or pond never repeats a
  talk, open or pickup and a single tap there is unchanged. Only a press that reached `attack` is buffered, never `act`'s
  other branches. **Co-op**: no protocol change. A guest's presses already arrive as the numbered `act` count and the HOST
  buffers them per player; a guest holding in a fight sends an extra `act` press every 0.05 s (`Interactions.guestHold`)
  so the host's buffer stays fresh (the guest does not know the cooldown). Cooldowns, damage and balance are untouched.
- **Phased sword swing** (`systems/swing.ts`; core engine, host-owned): a press starts the body's `slash` at once, sped up so its
  strike frame (4, blade fully out, measured from the sheet) plays 90 ms in; the blow (damage, arc, sound, spark, hit-stop,
  Arcane Edge charge) resolves on that CONTACT tick from where hero and foes stand then (`Player.swing`, `Simulation.strike`).
  Aim assist stays at the press; a mouse-aimed swing keeps its direction through startup; each foe is hit once; a hero hurt,
  felled, beaten or moved to another zone before contact swings at nothing. Cooldown, DPS and the input buffer are unchanged
  (bows, wands and tomes do not share the path). **Co-op**: no protocol change. The `slash` event now fires at contact, so a
  guest sees the arc with the strike and starts its copy of the body at the strike frame (`Character.play`'s `elapsedMs`);
  the guest's own press has no local prediction, as before.
- **Roaming people** (`ZoneState.folk[].roamer`, `systems/roam.ts`): the host or solo steps them in an occupied zone while time runs
  (capability `roaming`); talking to one (`ZoneState.attend`) stops it, turns it to the speaker and sends it home after a moment.
  A guest only sets positions from `SnapMsg.folk`; zones seen from next door keep their people still.
- **Memory stays bounded.** Zones load on demand, doors prefetch the zone behind them, and a zone nobody is near is
  unloaded after a while (`Zones.retire`). What must outlast it (opened chests, ground items, crops, ponds, moved
  barrels) is kept in `Arena.memory` (`ZoneMemory`); its mobs start afresh. Add to `ZoneMemory` when a new thing must
  survive.
- **Saving** (`overworld/Persistence.ts`, `systems/save.ts`; core engine): a solo game of a fixed or random world autosaves to
  `localStorage` (every 10 s, on a zone change, when the tab hides) under the world's tag, and `main.ts` puts it back at boot, with the hero at **home** (`arena.wake()`: the content's `home`, else the start node; a solo fall wakes there too), never where they stood, so a refresh cannot respawn nearby foes to farm levels. Health and mana are saved, health floored at 25% (a fall still heals);
  the Status tab's "New game" forgets it. A save is the hero (items by id, so retuned items still load; unknown ones are
  dropped), the scenario node (adopted, not travelled to), the chests opened and the map explored (`Atlas.pack`). The saved zone and spot stay in the format but are ignored. Mobs, crops, ground items and scenario choices
  made start afresh. **Co-op**: only a solo game saves; the host's world is not saved yet and a guest's hero is the host's; online `wake()` stays the start node.
  Live worlds are not saved. Bump `SAVE_VERSION` only for a change an old save cannot be read as.

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
