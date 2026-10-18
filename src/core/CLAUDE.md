# src/core: engine plumbing

Scene loop, camera, input, bindings, combos, touch. Headers of each file explain it; the design rules:

- **Game code asks about actions, never raw keys** (`controls.ts`: `actionDown`/`actionPressed`). Controls are
  rebindable (`bindings.ts`, two slots per action, saved in localStorage). The menu, map and stop-time keys are
  `FIXED_KEYS`, reserved and never hard-coded elsewhere: ask `menuPressed()`, `mapPressed()`, `stopPressed()`, `tabStep()`.
  `tools/ui/touchKeys.test.ts` checks every `data-key` in `index.html` is a code the game listens for.
- **Touch works through the same keys.** `touch.ts` turns the on-screen pad and every `[data-key]` element into
  key presses, so a new button is just a `data-key` element. **It cancels every touch's default action outside an
  allow-list (`keepDefault`), which also stops the browser making the click: a new tappable overlay must be added to it.**
- **The quick-item button is not a `data-key` button**: a held key cannot tell a tap from a swipe, so `hud/ItemButton.ts` reads
  its own pointer events (per pointer id, so it works beside the stick and A: three fingers at once). Its keys are the bindable
  actions `itemUse`, `itemPrev`, `itemNext` (F, Q, E; no touch code) plus the reserved 1-3 (`HOTBAR_KEYS`); the gesture
  thresholds are in `systems/hotbar.ts`. It is local UI: nothing is sent (`src/hud/CLAUDE.md`).
- **The dodge roll** (`systems/roll.ts`, core engine, host-owned; action `roll`, Left Shift, rebindable; touch `#btn-roll`, 60 px left of A, `data-key` KeyK, mirrored in `hud/threatPulse.ts` `keepClear`): a 13-frame, 2.25-cell dash (`Simulation.rollTick`, through `Collision.slide` in 6 px sub-steps) toward the walk keys, else the aim, else the facing; invulnerable only on frames 2-7 (`Player.safe` reads the roll's own clock, so it can never grant more); cooldown from the start of the last roll: 5 s for a roll the way it went or sideways, 1.2 s for a roll BACK on it (a turn of 120 degrees or more: `rollWaitFor`, `Player.rollSince`/`rollDir`), so a dodge can be undone but rolling is never travel (`roll.test.ts` holds the best sequence to a quarter over walking); the ring on the hero shows the full 5 s; refused in hit-stun, knock, down and for the DM; cancels a swing's startup/recovery and a bow draw; attacks and casts wait for it (no free blow). A press just before it is legal is buffered (`AttackBuffer`, 0.16 s). The look (`entities/RollLook.ts`, every page from `FLAG.roll`): squash and one turn of the existing sprite, afterimages, dust, a whoosh (`roll`), and the cooldown ON THE HERO as the dim, tight ring flaring when ready. No roll art exists (LPC has none packed). **Co-op (v58)**: a guest sends the toggle bit `KEY.roll` of `InputMsg.keys` (flips on each press: state, not an event), the host rolls that hero and sets `FLAG.roll`; nothing is predicted (the guest's own hero glides to the host's roll).
- **The stick floats by default** (`stick.ts`, Pixi-free): a touch on the bare canvas in the left half plants the pad
  there and it follows the thumb; `fixed` keeps the corner pad. Deadzone 0.05 to 0.6, saved in localStorage,
  `?stick=`/`?deadzone=`. Input only, no co-op impact (host and guest read the same keys).
- **One camera rule everywhere** (`camera.ts`): integer zoom chosen from the window (a phone, short side under 440, gets 2 so the hero is readable), the player in the middle, the
  camera easing after them and never leaving the map; the iris and zone crossings only `punch`/`adopt` it.
  `shake` is a random wobble (big moments); `kick(dx, dy, px, seconds)` is the weight of a blow: a whole-pixel push along
  its direction that fades linearly (2 px / 0.09 s a hit, 3.5 px / 0.12 s a kill, 4 px on the hero hurt; capped at 6),
  played by `Visuals` from the events that already exist (`systems/feel.ts` `FX_KICK`). **Co-op**: no message; every page
  gets the same `hitSpark`/death/`heroHurt` events and kicks only its own player's screen (the effect's `p`).
- **Aim** (`aim.ts`): `move` aims the way you walk, `mouse` aims at the pointer (on touch, the last tap). Aim rides in
  `Command.aim`; a guest sends it as `InputMsg.am`. The hero keeps facing the way they walk; only an attack or spell
  turns them toward the aim.
- **Combos** (`combo.ts`, `ComboReader`) read direction presses with a forgiving window, especially on touch; the
  finished combo's index into the weapon's combo list rides in `Command.combo` (see `src/systems/CLAUDE.md`).
- `direction.ts` (facings, `DIRS`/`dirIndex` for the wire) and `interp.ts` (snapshot smoothing) are the Pixi-free bits
  that sprites, entities and `net/` share.
