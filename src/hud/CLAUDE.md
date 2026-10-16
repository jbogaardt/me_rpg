# src/hud: HTML overlays

The HUD, dialog, menu, shop counter, trade window, map overlay and loading screen are **DOM, not Pixi**, so text stays
sharp on phones and can use safe-area insets; markup is in `index.html`, styles in `src/ui.css`. The game keeps a single
`<canvas>` (the smoke tests rely on it): the map overlay is painted on a detached canvas and shown as an `<img>`.

- **Reuse the UI kit classes** (`.panel`, `.wood`, `.paper`, plank tabs, square buttons; Lamoot's RPG GUI kit, CC-BY, see
  CREDITS.md, cut by `tools/ui/cut-gui.ts`) and the fonts (Cinzel titles, Crimson Text body) rather than inventing styles.
- Build text with `textContent`, never `innerHTML`, for anything that came from a player or content.
- A new tappable overlay must be added to the touch allow-list (`src/core/CLAUDE.md`); a new button is a `data-key` element.
- **One dialog box** (`Dialog`) says everything spoken to the player, and nothing overlaps: a *conversation* (NPC, quest
  brief, sign: paged, the player stands still, the next waits in line, `pauses` holds the world for everyone) and an *aside*
  (the Dungeon Master's words: the player keeps playing, it leaves by itself or on its ✕, a conversation takes the box, the aside
  comes back after it; asides wait in order, a few at most, and a stale one is dropped; each page also *speaks* an aside with the browser's own speech synthesis, `voice.ts`, local and mutable with its 🔊, nothing sent). Say new things through it; do not add another text overlay.
- **The map overlay is local**: it fills in as the players in view explore (`map/explored.ts`), nothing is sent. Rooms
  have none, and the `map` capability can turn it off or show the whole zone.
