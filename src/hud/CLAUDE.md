# src/hud: HTML overlays

The HUD, dialog, menu, shop counter, trade window, map overlay and loading screen are **DOM, not Pixi**, so text stays
sharp on phones and can use safe-area insets; markup is in `index.html`, styles in `src/ui.css`. The game keeps a single
`<canvas>` (the smoke tests rely on it): the map overlay is painted on a detached canvas and shown as an `<img>`.

- **Reuse the UI kit classes** (`.panel`, `.wood`, `.paper`, plank tabs, square buttons; Lamoot's RPG GUI kit, CC-BY, see
  CREDITS.md, cut by `tools/ui/cut-gui.ts`) and the fonts (Cinzel titles, Crimson Text body) rather than inventing styles.
- Build text with `textContent`, never `innerHTML`, for anything that came from a player or content.
- **Item pictures** are `iconSvg(kind, art)` (`itemIcons.ts`): picture `art` of the kind in the item sheet (`systems/itemArt.ts`, built by `tools/sprites/itemSheet.ts`, drawn as a CSS background of the `--item-sheet` variable), else the SVG fallback. An item names its picture with `art` in `items.json` (core engine: presentation only, no co-op traffic); anything eaten or drunk is the `food` kind. Ground items and relics use the same cells in Pixi (`entities/itemArt.ts`).
- A new tappable overlay must be added to the touch allow-list (`src/core/CLAUDE.md`); a new button is a `data-key` element.
- **Dialog box vs. DM caption** (`Dialog`): the box says *conversations* (NPC, quest brief, sign: paged, the player stands
  still, the next waits in line, `pauses` holds the world for everyone). The Dungeon Master's words are never a dialog: they
  are a *caption* (`#dm-caption`), plain text on a clear background that takes **no input** (a key or click never touches it),
  never stops play and leaves by itself; each page also speaks it, with the browser's own voice, or the Kokoro model (in its own worker) only when chosen in the Controls tab (`voice.ts`, `naturalVoice.ts`, rules in `voiceChoice.ts`: a ~90 MB download, seconds per sentence, stored as `voice-natural` = `1`; never the default). The browser's own speech synthesis speaks until it is ready and if it fails, and a failure is said once as a passive note; local,
  mutable with its 🔊, nothing sent). Say new DM words through `tell`; do not add another overlay. `tell` also cuts director cues (`<cue:.../>`, `docs/dungeon-master.md`) out of any text and, for a line that has some, types it out at reading pace and hands each cue to `onCue` when reached.
- **Popups only when the player starts a conversation** (an NPC, the quest-giver, a sign, a shop, the Dungeon Master in
  person: walk up and press the action key). Everything the game tells a player unasked (a defeat, a quest the DM gave, a
  chapter's note, a trial's result) is *passive text*: `Dialog.note`, the same caption as the DM's words. Never `say` for those.
- **Item pickups are a toast, never a card** (`PickupToasts`, rules in `toastStack.ts`): a small see-through stack at the left edge, merged repeats, gone in about 2 s (1 s with a foe near), plus a short chime (`playPing`). Local to each player, nothing is sent; core engine.
- **Combat sounds** (`gameSfx.ts`, event table in `systems/gameSounds.ts`; core engine, cosmetic, no capability): swing, hit, hurt, death, bolt, chest, level-up and pickup, procedural, hooked in `Visuals` (`particles`, `swing`, `bolt`, `text`), so the host, solo and every co-op guest play from the events they already get (no protocol change; the host's `Simulation.fx` goes through the same call, so one event is one sound). Separate from the DM's cue vocabulary (`sfx.ts`) and from the voice mute: own mute and volume in the Controls tab (`SoundSetting`, `core/soundSettings.ts`). Master gain into a compressor, 6 voices, jittered. A whiff (`swing`, at the swing's start, airy: slow `attack`, high noise, no tone) and a hit (`hitSpark`, only on a landed blow: instant, low thud) must stay distinct (test). A new sound is a name, a recipe and a table line.
- **The map overlay is local and always available**: it fills in as the players in view explore (`map/explored.ts`),
  nothing is sent; a solo game saves it with the rest (`Atlas.pack`). The button and M key never go missing (host, guest, DM, touch, any zone); a room has no overview, so
  there the map opens on its name and a note (`MapOverlay.setRoom`). Only the aids on it are optional: the `guide`
  capability (search circle, star, tracker line; its `fog` setting shows the whole zone) and the `compass` capability,
  each also switchable by the player in the Controls tab (`AidSetting`, `systems/aids.ts`).
- **Partner arrows** (`PartnerArrows.ts`, maths in `edgeArrow.ts`; core engine, online only): an edge-of-screen arrow in the
  partner's colour with the distance in tiles for a partner in this zone but out of view, and a chip for one in another zone.
  Nothing is sent: a guest already gets every in-zone player in `snap.players` and the rest in `away`, so it can say "in another
  zone" but only the host knows which zone (the chip names it when the player's `zone` is known).
- **The hotbar** (`Hotbar.ts`, rules in `systems/hotbar.ts`; core engine, per-player UI state): four quick slots in a column on the
  right edge (clear of the D-pad and A), keys 1-4 (`HOTBAR_KEYS`, reserved) or a tap (`data-key` buttons). A slot stores an
  item *name* (never a pack index) and a use is an ordinary Inventory op, so co-op needs nothing new: the guest applies it
  and asks the host like any menu action. Slots are assigned from the Inventory tab, saved in `localStorage` only, never sent.
  Gamepad mapping: not done (the game has no gamepad input yet).
- **Joining closes the menu and reports through `#join-status`** (`JoinStatus.ts`, words from `net/joinStatus.ts`):
  connecting, waiting for the host, joined (fades), or a failure with its reason (stays until dismissed and brings the
  Online tab back to retry). Guest-only; a host has nothing to join. The relay cannot tell a full game from a closed one.
- **The level-up splash is local** (`LevelSplash`; core engine): a big "Level N" with what grew, shown when the local hero's level rises, whatever gave it (kill, quest, chest, training, or the host's `pack` for a guest). It watches the hero each frame instead of hooking each path, so a new source of XP needs nothing; nothing is sent. `reset` takes the level without a splash (a loaded save, a new role). The floating "LEVEL UP!" text and sparks are the world's, for everyone to see.
- **The map overlay is local**: it fills in as the players in view explore (`map/explored.ts`), nothing is sent. Rooms
  have none, and the `map` capability can turn it off or show the whole zone.
- **Voice input for the chat lines** (`dictation.ts`; core engine, local, co-op needs nothing): Enter on an empty DM-bar or request line (or Enter from the game, which opens it) starts the browser's SpeechRecognition and fills the line as words are heard; Enter again stops and submits through the form's normal handler. Typed text and browsers without recognition (Firefox) behave as before. The mic only starts on the player's own Enter. While it listens the DM's voice is hushed (`voice.hush`; the mic would hear it), and a typed edit or Backspace restarts the recognizer from what the line then holds, or it would write its whole transcript back over the fix.
