# src/core: engine plumbing

Scene loop, camera, input, bindings, combos, touch. Headers of each file explain it; the design rules:

- **Game code asks about actions, never raw keys** (`controls.ts`: `actionDown`/`actionPressed`). Controls are
  rebindable (`bindings.ts`, two slots per action, saved in localStorage). The menu, map and stop-time keys are
  `FIXED_KEYS`, reserved and never hard-coded elsewhere: ask `menuPressed()`, `mapPressed()`, `stopPressed()`, `tabStep()`.
  `tools/ui/touchKeys.test.ts` checks every `data-key` in `index.html` is a code the game listens for.
- **Touch works through the same keys.** `touch.ts` turns the on-screen pad and every `[data-key]` element into
  key presses, so a new button is just a `data-key` element. **It cancels every touch's default action outside an
  allow-list (`keepDefault`), which also stops the browser making the click: a new tappable overlay must be added to it.**
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
