// Which picture of the item sheet an item gets (Pixi-free, tested; core engine). Items are drawn from `IconKind`
// (systems/inventory.ts), never from an id: a kind with a cell here shows that sprite, a kind without one (the greaves)
// falls back to its SVG icon (hud/itemIcons.ts). The sheet (public/sprites/items/items.png) is a strip of 32x32 cells cut
// from the "[LPC] Items and game effects" pack (CREDITS.md); its cells are in the order of this list.

import type { IconKind } from './inventory';

export const ITEM_CELL = 32;
export const ITEM_COLS = 8;
export const ITEM_ROWS = 2;

const ORDER: IconKind[] = [
  'sword',
  'dagger',
  'bow',
  'shield',
  'helm',
  'armor',
  'boot',
  'cape',
  'tool',
  'sack',
  'backpack',
  'charm',
  'food',
  'wand',
  'tome',
];

/** The sheet cell of a kind (column, row), if the pack has a picture for it. */
export function itemArtCell(kind: IconKind): { col: number; row: number } | undefined {
  const i = ORDER.indexOf(kind);
  return i < 0 ? undefined : { col: i % ITEM_COLS, row: Math.floor(i / ITEM_COLS) };
}
