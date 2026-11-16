// How a map's baked picture (art/maps/<id>.webp, drawn by tools/towercraftGround.ts) sits on the board: it is bigger than the board by
// FIELD_BORDER picture pixels on every side (woods fading into the dark), and the page's background is the colour it fades to.
// Pixi-free and cosmetic: the rules never read it.

/** Picture pixels per board cell (the board tool draws at this scale; the game shows a cell at its own CELL size). */
export const FIELD_PX = 32;
/** Picture pixels of scenery drawn past the board's edge, on every side. */
export const FIELD_BORDER = 96;

/** The colour each map fades to at its picture's edge, and what the page shows beyond it. */
export const FIELD_BG: Readonly<Record<string, number>> = {
  greenwood: 0x0d1710,
  frostlands: 0x0e1621,
  desert: 0x1d150d,
  mire: 0x0c130f,
  ember: 0x130b0a,
  crossroads: 0x0d1710,
  hbridge: 0x1d150d,
  twinfords: 0x0e1621,
  delta: 0x130b0a,
};
