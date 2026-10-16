# src/hud: HTML overlays

The HUD, dialog, menu, shop counter, trade window, map overlay and loading screen are **DOM, not Pixi**, so text stays
sharp on phones and can use safe-area insets; markup is in `index.html`, styles in `src/ui.css`. The game keeps a single
`<canvas>` (the smoke tests rely on it): the map overlay is painted on a detached canvas and shown as an `<img>`.

- **Reuse the UI kit classes** (`.panel`, `.wood`, `.paper`, plank tabs, square buttons; Lamoot's RPG GUI kit, CC-BY, see
  CREDITS.md, cut by `tools/ui/cut-gui.ts`) and the fonts (Cinzel titles, Crimson Text body) rather than inventing styles.
- Build text with `textContent`, never `innerHTML`, for anything that came from a player or content.
- A new tappable overlay must be added to the touch allow-list (`src/core/CLAUDE.md`); a new button is a `data-key` element.
- **Dialog box vs. DM caption** (`Dialog`): the box says *conversations* (NPC, quest brief, sign: paged, the player stands
  still, the next waits in line, `pauses` holds the world for everyone). The Dungeon Master's words are never a dialog: they
  are a *caption* (`#dm-caption`), plain text on a clear background that takes **no input** (a key or click never touches it),
  never stops play and leaves by itself; each page also speaks it with the browser's own speech synthesis (`voice.ts`, local,
  mutable with its 🔊, nothing sent). Say new DM words through `tell`; do not add another overlay.
- **Popups only when the player starts a conversation** (an NPC, the quest-giver, a sign, a shop, the Dungeon Master in
  person: walk up and press the action key). Everything the game tells a player unasked (a defeat, a quest the DM gave, a
  chapter's note, a trial's result) is *passive text*: `Dialog.note`, the same caption as the DM's words. Never `say` for those.
- **The map overlay is local**: it fills in as the players in view explore (`map/explored.ts`), nothing is sent. Rooms
  have none, and the `map` capability can turn it off or show the whole zone.
