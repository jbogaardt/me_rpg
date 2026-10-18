// Builds public/tilesets/interior.png: the floor, walls, counter, shelves, signs and lectern inside the shops, composed from
// LPC art (art/lpc_interior/: "[LPC] Floors" and "LPC Wooden Furniture" by bluecarrot16 and others, CC-BY-SA, and the LPC base
// assets' interior wall by Sharm), with the stock on the shelves drawn from the game's own item sheet and the signs from the
// hanging-sign sheet. Every piece is cut on its own pixels (no scaling, no recolour). Where each piece sits on the output is
// `INTERIOR` in catalog.ts. Run with `npm run tilesets`; the output is committed.

import path from 'node:path';
import { readPng, writePng, ROOT, type Image } from './image';
import { blank, crop, over } from './compose';
import { INTERIOR } from './catalog';

const art = (file: string) => readPng(path.join(ROOT, 'art/lpc_interior', file));
const FLOORS = art('floors.png');
const CITY = readPng(path.join(ROOT, 'art/lpc_city/city_outside.png'));
const FURNITURE = art('furniture.png');
const ITEMS = readPng(path.join(ROOT, 'public/sprites/items/items.png'));
const SIGNS = readPng(path.join(ROOT, 'public/tilesets/hanging_signs.png'));
const OUT = path.join(ROOT, 'public/tilesets/interior.png');

/** Item cells of the item sheet (`ORDER` in src/systems/itemArt.ts), 8 to a row. */
const ITEM = {
  sword: 0,
  dagger: 1,
  bow: 2,
  shield: 3,
  helm: 4,
  armor: 5,
  boot: 6,
  cape: 7,
  tool: 8,
  sack: 9,
  backpack: 10,
  charm: 11,
  food: 12,
  wand: 13,
  tome: 14,
  gem: 15,
};
type Item = keyof typeof ITEM;
const item = (kind: Item) => crop(ITEMS, (ITEM[kind] % 8) * 32, Math.floor(ITEM[kind] / 8) * 32, 32, 32);

/** The hanging-sign cell (column, row) of each trade (HANG_* in catalog.ts). */
const SIGN_CELL = {
  smithy: [3, 1],
  armory: [2, 0],
  ranger: [0, 0],
  apothecary: [3, 0],
  wizard: [2, 1],
  tavern: [0, 1],
} as const;

/** What each shop's shelves hold: two rows of three, one item to a bay. */
const STOCK: Record<keyof typeof SIGN_CELL, [Item, Item, Item, Item, Item, Item]> = {
  smithy: ['sword', 'dagger', 'shield', 'tool', 'sword', 'dagger'],
  armory: ['helm', 'armor', 'boot', 'shield', 'helm', 'cape'],
  ranger: ['bow', 'cape', 'backpack', 'dagger', 'boot', 'sack'],
  apothecary: ['gem', 'charm', 'food', 'sack', 'gem', 'charm'],
  wizard: ['tome', 'wand', 'gem', 'wand', 'tome', 'charm'],
  tavern: ['food', 'sack', 'food', 'sack', 'food', 'tool'],
};

const OPEN_SHELF = crop(FURNITURE, 320, 128, 32, 64); // dark open shelving, four boards
// The counter is three kitchen-counter segments end to end (they are drawn to join): all plain.
const COUNTER = [crop(FURNITURE, 96, 12, 64, 38), crop(FURNITURE, 160, 12, 32, 38), crop(FURNITURE, 160, 12, 32, 38)];
const STAND = crop(FURNITURE, 448, 290, 32, 30); // a small cabinet, for the lectern

const sheet = blank(768, 208);
const put = (name: keyof typeof INTERIOR, img: Image, dx = 0, dy = 0) =>
  over(sheet, img, INTERIOR[name].x + dx, INTERIOR[name].y + dy);

// Ground: two plank floors, the wall's crown and baseboard rows, and a mat at the door.
put('planksA', crop(FLOORS, 192, 1218, 32, 32));
put('planksB', crop(FLOORS, 224, 1218, 32, 32));
// The back wall is the City pack's grey stone: brick above, a cobbled course along the floor.
put('wallTop', crop(CITY, 480, 288, 32, 32));
put('wallBase', crop(CITY, 480, 352, 32, 32));
put('mat', crop(FLOORS, 96, 1090, 32, 32));

// The counter, standing on the bottom of its 48px box.
let cx = 0;
for (const piece of COUNTER) {
  put('counter', piece, cx, 10);
  cx += piece.width;
}

for (const trade of Object.keys(SIGN_CELL) as (keyof typeof SIGN_CELL)[]) {
  const cap = trade.charAt(0).toUpperCase() + trade.slice(1);
  // Shelves: three open bays with the shop's stock on the boards.
  const shelf = `shelf${cap}` as keyof typeof INTERIOR;
  for (let bay = 0; bay < 3; bay++) put(shelf, OPEN_SHELF, bay * 32);
  STOCK[trade].forEach((kind, i) => put(shelf, item(kind), (i % 3) * 32, i < 3 ? -2 : 24));
  // The sign: the trade's hanging board, in the middle of its 128x64 box.
  const [col, row] = SIGN_CELL[trade];
  put(`sign${cap}` as keyof typeof INTERIOR, crop(SIGNS, col * 32, row * 32, 32, 32), 48, 16);
}

// A window: the City pack's window with the dark panes turned to daylight (we are looking out from inside).
const pane = crop(CITY, 640, 0, 32, 32);
for (let i = 0; i < pane.data.length; i += 4) {
  if (pane.data[i + 3] === 0 || pane.data[i] + pane.data[i + 1] + pane.data[i + 2] > 150) continue;
  const lift = 1 + (pane.data[i + 2] % 3) * 0.04; // a little grain so the glass is not flat
  [pane.data[i], pane.data[i + 1], pane.data[i + 2]] = [
    Math.round(176 * lift),
    Math.round(208 * lift),
    Math.round(228),
  ];
}
put('window', pane);

// The wizard's lectern: a stand with an open book on it.
put('lectern', STAND, 0, 18);
put('lectern', item('tome'), 0, -4);

writePng(OUT, sheet);
console.log(`wrote interior.png (${sheet.width}x${sheet.height})`);
