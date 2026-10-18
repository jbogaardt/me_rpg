// Builds public/sprites/items/items.png: the pictures of every icon kind (src/systems/itemArt.ts) as a grid of 32x32 cells,
// cut from "[LPC] Items and game effects", "[LPC] Fruit and Veggie Inventory" and "[LPC] Food" (art/lpc_items/, see
// CREDITS-items.txt). Each kind lists its pictures in order; picture 0 is its plain one (the strip the game shipped before,
// `S`), the rest are what items name with `art`. A cell is (column, row) of its source sheet. Cells are moved, never redrawn.
// Run with `npm run items`; the output is committed. The counts here must equal `ITEM_VARIANTS` (checked).

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from '../map/image';
import { blank, crop, over } from '../map/compose';
import { ITEM_CELL, ITEM_COLS, ITEM_COUNT, ITEM_KINDS, ITEM_ROWS, ITEM_VARIANTS } from '../../src/systems/itemArt';
import type { IconKind } from '../../src/systems/inventory';

const sheetOf = (file: string) => readPng(path.join(ROOT, 'art/lpc_items', file));
const SHEETS = { S: sheetOf('strip.png'), I: sheetOf('items1.png'), V: sheetOf('veg.png'), F: sheetOf('food.png') };
type Src = readonly [keyof typeof SHEETS, number, number];

/** The strip's own cells, in the order the game used (8 to a row). */
const S = (index: number): Src => ['S', index % 8, Math.floor(index / 8)];
const I = (col: number, row: number): Src => ['I', col, row];
const V = (col: number, row: number): Src => ['V', col, row];
const F = (col: number, row: number): Src => ['F', col, row];

export const PICTURES: Record<IconKind, Src[]> = {
  sword: [S(0), I(7, 0), I(8, 0), I(0, 2), I(0, 4), I(10, 0), I(6, 5), I(9, 4), I(15, 5), I(9, 5), I(9, 6)],
  dagger: [S(1), I(8, 0), I(7, 4), I(7, 5)],
  bow: [S(2), I(4, 1), I(5, 1), I(12, 7), I(6, 0)],
  shield: [S(3), I(2, 0), I(2, 2), I(3, 1), I(3, 2), I(3, 3), I(14, 3), I(14, 4), I(1, 7)],
  helm: [S(4), I(1, 1), I(1, 3), I(1, 5), I(9, 1)],
  armor: [S(5), I(4, 0), I(5, 0), I(0, 1), I(0, 5), I(15, 4), I(12, 0), I(6, 1), I(6, 3), I(15, 3), I(15, 2), I(6, 2)],
  greaves: [I(2, 1), I(2, 3), I(2, 5)],
  boot: [S(6), I(13, 3), I(13, 4), I(15, 0)],
  cape: [S(7)],
  tool: [S(8)],
  sack: [S(9)],
  backpack: [S(10)],
  charm: [S(11), I(13, 5), I(13, 6), I(4, 9)],
  food: [
    S(12), // bread
    I(3, 5), // 1 red potion
    I(4, 5), // 2 blue potion
    I(5, 5), // 3 green potion
    I(0, 6), // 4 bottle
    I(11, 5), // 5 barrel
    I(8, 6), // 6 roast meat
    I(5, 6), // 7 salad
    I(6, 6), // 8 cheese
    V(2, 0), // 9 apple
    V(3, 0), // 10 carrot
    V(0, 1), // 11 cabbage
    V(0, 0), // 12 tomato
    V(1, 0), // 13 strawberry
    V(4, 0), // 14 pumpkin
    V(7, 0), // 15 watermelon
    V(1, 1), // 16 potato
    F(3, 1), // 17 honey cake
    F(5, 5), // 18 jerky
    F(5, 2), // 19 berries
    F(8, 5), // 20 ribs
    F(2, 0), // 21 loaf
    F(0, 8), // 22 pie
    I(5, 8), // 23 herbs
  ],
  wand: [S(13), I(9, 2)],
  tome: [S(14), I(0, 9), I(1, 9)],
  gem: [S(15), I(12, 3), I(12, 4), I(12, 5)],
};

export function buildSheet(): Image {
  const out = blank(ITEM_COLS * ITEM_CELL, ITEM_ROWS * ITEM_CELL);
  let i = 0;
  for (const kind of ITEM_KINDS) {
    const list = PICTURES[kind];
    if (list.length !== ITEM_VARIANTS[kind])
      throw new Error(`${kind}: ${list.length} pictures listed, itemArt.ts says ${ITEM_VARIANTS[kind]}`);
    for (const [sheet, col, row] of list) {
      const cell = crop(SHEETS[sheet], col * ITEM_CELL, row * ITEM_CELL, ITEM_CELL, ITEM_CELL);
      over(out, cell, (i % ITEM_COLS) * ITEM_CELL, Math.floor(i / ITEM_COLS) * ITEM_CELL);
      i++;
    }
  }
  if (i !== ITEM_COUNT) throw new Error(`built ${i} cells, expected ${ITEM_COUNT}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writePng(path.join(ROOT, 'public/sprites/items/items.png'), buildSheet());
  console.log(`wrote items.png (${ITEM_COUNT} pictures, ${ITEM_COLS}x${ITEM_ROWS} cells)`);
}
