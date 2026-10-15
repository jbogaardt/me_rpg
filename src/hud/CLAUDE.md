# src/hud: HTML overlays

The HUD, dialog, menu, shop counter, trade window, map overlay and loading screen are **DOM, not Pixi**, so text stays
sharp on phones and can use safe-area insets; markup is in `index.html`, styles in `src/ui.css`. The game keeps a single
`<canvas>` (the smoke tests rely on it): the map overlay is painted on a detached canvas and shown as an `<img>`.

- **Reuse the UI kit classes** (`.panel`, `.wood`, `.paper`, plank tabs, square buttons; Lamoot's RPG GUI kit, CC-BY, see
  CREDITS.md, cut by `tools/ui/cut-gui.ts`) and the fonts (Cinzel titles, Crimson Text body) rather than inventing styles.
- Build text with `textContent`, never `innerHTML`, for anything that came from a player or content.
- A new tappable overlay must be added to the touch allow-list (`src/core/CLAUDE.md`); a new button is a `data-key` element.
- **The map overlay is local**: it fills in as the players in view explore (`map/explored.ts`), nothing is sent. Rooms
  have none, and the `map` capability can turn it off or show the whole zone.
