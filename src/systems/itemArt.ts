// Which picture of the item sheet an item gets (Pixi-free, tested; core engine). Items are drawn from `IconKind`
// (systems/inventory.ts) and an optional `art` (the item's own number among that kind's pictures), never from an id: a kind
// with a cell here shows that sprite, a kind without one falls back to its SVG icon (hud/itemIcons.ts). The sheet
// (public/sprites/items/items.png, built by tools/sprites/itemSheet.ts) is a grid of 32x32 cells cut from "[LPC] Items and
// game effects" and two LPC food sets (CREDITS.md); a kind's pictures are consecutive cells, picture 0 being its plain one,
// in the order of `KINDS`. Items that name no `art` keep picture 0, so existing content looks as it always did.

import type { IconKind } from './inventory';

export const ITEM_CELL = 32;
export const ITEM_COLS = 8;

/** Each kind and how many pictures the sheet holds of it, in sheet order (the tool checks its cell lists against this). */
const KINDS: readonly (readonly [IconKind, number])[] = [
  ['sword', 11],
  ['dagger', 4],
  ['bow', 5],
  ['shield', 9],
  ['helm', 5],
  ['armor', 12],
  ['greaves', 3],
  ['boot', 4],
  ['cape', 1],
  ['tool', 1],
  ['sack', 1],
  ['backpack', 1],
  ['charm', 4],
  ['food', 24],
  ['wand', 2],
  ['tome', 3],
  ['gem', 4],
];

export const ITEM_KINDS = KINDS.map(([kind]) => kind);

/** How many pictures of each kind the sheet has. */
export const ITEM_VARIANTS = Object.fromEntries(KINDS) as Record<IconKind, number>;

const START = new Map<IconKind, number>();
let total = 0;
for (const [kind, count] of KINDS) {
  START.set(kind, total);
  total += count;
}

/** Cells in the sheet, and its rows. */
export const ITEM_COUNT = total;
export const ITEM_ROWS = Math.ceil(total / ITEM_COLS);

/** The sheet cell (column, row) of picture `art` of a kind (an unknown picture falls back to the plain one). */
export function itemArtCell(kind: IconKind, art = 0): { col: number; row: number } | undefined {
  const start = START.get(kind);
  if (start === undefined) return undefined;
  const i = start + (Number.isInteger(art) && art >= 0 && art < ITEM_VARIANTS[kind] ? art : 0);
  return { col: i % ITEM_COLS, row: Math.floor(i / ITEM_COLS) };
}
