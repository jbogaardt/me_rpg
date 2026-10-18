import { describe, expect, it } from 'vitest';
import { ITEM_CELL, ITEM_COLS, ITEM_ROWS, ITEM_VARIANTS } from '../../src/systems/itemArt';
import { buildSheet, PICTURES } from './itemSheet';

describe('the item sheet', () => {
  it('lists as many pictures per kind as itemArt.ts counts', () => {
    for (const [kind, list] of Object.entries(PICTURES))
      expect(list.length).toBe(ITEM_VARIANTS[kind as keyof typeof ITEM_VARIANTS]);
  });

  it('builds a full grid with a drawn picture in every cell', () => {
    const sheet = buildSheet();
    expect(sheet.width).toBe(ITEM_COLS * ITEM_CELL);
    expect(sheet.height).toBe(ITEM_ROWS * ITEM_CELL);
    const count = Object.values(ITEM_VARIANTS).reduce((a, b) => a + b, 0);
    for (let i = 0; i < count; i++) {
      const x0 = (i % ITEM_COLS) * ITEM_CELL;
      const y0 = Math.floor(i / ITEM_COLS) * ITEM_CELL;
      let opaque = 0;
      for (let y = 0; y < ITEM_CELL; y++)
        for (let x = 0; x < ITEM_CELL; x++) if (sheet.data[((y0 + y) * sheet.width + x0 + x) * 4 + 3] > 0) opaque++;
      expect(opaque, `cell ${i} is empty`).toBeGreaterThan(20);
    }
  });
});
