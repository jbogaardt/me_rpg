# src/hud: HTML overlays

The HUD, dialog, menu, shop counter, trade window, map overlay and loading screen are **DOM, not Pixi**, so text stays
sharp on phones and can use safe-area insets; markup is in `index.html`, styles in `src/ui.css`. The game keeps a single
`<canvas>` (the smoke tests rely on it): the map overlay is painted on a detached canvas and shown as an `<img>`.

- **Reuse the UI kit classes** (`.panel`, `.wood`, `.paper`, plank tabs, square buttons; Lamoot's RPG GUI kit, CC-BY, see
  CREDITS.md, cut by `tools/ui/cut-gui.ts`) and the fonts (Cinzel titles, Crimson Text body) rather than inventing styles.
- Build text with `textContent`, never `innerHTML`, for anything that came from a player or content.
- **Item pictures** are `iconSvg(kind)` (`itemIcons.ts`): the pack's sprite for the kind (`systems/itemArt.ts`, drawn as a CSS background of the `--item-sheet` variable), else the SVG fallback. Ground items and relics use the same cells in Pixi (`entities/itemArt.ts`).
- A new tappable overlay must be added to the touch allow-list (`src/core/CLAUDE.md`); a new button is a `data-key` element.
- **Dialog box vs. DM caption** (`Dialog`): the box says *conversations* (NPC, quest brief, sign: paged, the player stands
  still, the next waits in line, `pauses` holds the world for everyone). The Dungeon Master's words are never a dialog: they
  are a *caption* (`#dm-caption`), plain text on a clear background that takes **no input** (a key or click never touches it),
  never stops play and leaves by itself; each page also speaks it, with the browser's own speech synthesis or, if the player opts in (Controls tab), the Kokoro model run in the page (`voice.ts`, `naturalVoice.ts`: a lazy ~90 MB one-time download from the Hugging Face hub, the browser's voice speaks until it is ready or if it fails; local,
  mutable with its 🔊, nothing sent). Say new DM words through `tell`; do not add another overlay. `tell` also cuts director cues (`<cue:.../>`, `docs/dungeon-master.md`) out of any text and, for a line that has some, types it out at reading pace and hands each cue to `onCue` when reached.
- **Popups only when the player starts a conversation** (an NPC, the quest-giver, a sign, a shop, the Dungeon Master in
  person: walk up and press the action key). Everything the game tells a player unasked (a defeat, a quest the DM gave, a
  chapter's note, a trial's result) is *passive text*: `Dialog.note`, the same caption as the DM's words. Never `say` for those.
- **Item pickups are a toast, never a card** (`PickupToasts`, rules in `toastStack.ts`): a small see-through stack at the left edge, merged repeats, gone in about 2 s (1 s with a foe near), plus a short chime (`playPing`). Local to each player, nothing is sent; core engine.
- **The map overlay is local**: it fills in as the players in view explore (`map/explored.ts`), nothing is sent. Rooms
  have none, and the `map` capability can turn it off or show the whole zone.
- **Partner arrows** (`PartnerArrows.ts`, maths in `edgeArrow.ts`; core engine, online only): an edge-of-screen arrow in the
  partner's colour with the distance in tiles for a partner in this zone but out of view, and a chip for one in another zone.
  Nothing is sent: a guest already gets every in-zone player in `snap.players` and the rest in `away`, so it can say "in another
  zone" but only the host knows which zone (the chip names it when the player's `zone` is known).
