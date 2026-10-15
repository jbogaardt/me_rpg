# src/core: engine plumbing

Scene loop, camera, input, bindings, combos, touch. Headers of each file explain it; the design rules:

- **Game code asks about actions, never raw keys** (`controls.ts`: `actionDown`/`actionPressed`). Controls are
  rebindable (`bindings.ts`, two slots per action, saved in localStorage). The menu, map and stop-time keys are
  `FIXED_KEYS`, reserved and never hard-coded elsewhere: ask `menuPressed()`, `mapPressed()`, `stopPressed()`, `tabStep()`.
  `tools/ui/touchKeys.test.ts` checks every `data-key` in `index.html` is a code the game listens for.
- **Touch works through the same keys.** `touch.ts` turns the on-screen pad and every `[data-key]` element into
  key presses, so a new button is just a `data-key` element. **It cancels every touch's default action outside an
  allow-list (`keepDefault`), which also stops the browser making the click: a new tappable overlay must be added to it.**
- **One camera rule everywhere** (`camera.ts`): integer zoom chosen from the window, the player in the middle, the
  camera easing after them and never leaving the map; the iris and zone crossings only `punch`/`adopt` it.
- **Aim** (`aim.ts`): `move` aims the way you walk, `mouse` aims at the pointer (on touch, the last tap). Aim rides in
  `Command.aim`; a guest sends it as `InputMsg.am`. The hero keeps facing the way they walk; only an attack or spell
  turns them toward the aim.
- **Combos** (`combo.ts`, `ComboReader`) read direction presses with a forgiving window, especially on touch; the
  finished combo's index into the weapon's combo list rides in `Command.combo` (see `src/systems/CLAUDE.md`).
- `direction.ts` (facings, `DIRS`/`dirIndex` for the wire) and `interp.ts` (snapshot smoothing) are the Pixi-free bits
  that sprites, entities and `net/` share.
