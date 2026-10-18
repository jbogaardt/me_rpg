import { describe, expect, it } from 'vitest';
import { ITEM_COLS, ITEM_COUNT, ITEM_KINDS, ITEM_ROWS, ITEM_VARIANTS, itemArtCell } from './itemArt';
import { iconKind } from './inventory';

describe('itemArtCell', () => {
  it('gives every picture of every kind its own cell inside the sheet', () => {
    const seen = new Set<string>();
    for (const kind of ITEM_KINDS) {
      expect(ITEM_VARIANTS[kind]).toBeGreaterThan(0);
      for (let art = 0; art < ITEM_VARIANTS[kind]; art++) {
        const cell = itemArtCell(kind, art);
        expect(cell).toBeDefined();
        expect(cell!.col).toBeLessThan(ITEM_COLS);
        expect(cell!.row).toBeLessThan(ITEM_ROWS);
        seen.add(`${cell!.col},${cell!.row}`);
      }
    }
    expect(seen.size).toBe(ITEM_COUNT);
  });

  it('shows the plain picture for an item with no art, or art the kind does not have', () => {
    expect(itemArtCell('food')).toEqual(itemArtCell('food', 0));
    expect(itemArtCell('sword', 999)).toEqual(itemArtCell('sword', 0));
    expect(itemArtCell('sword', -1)).toEqual(itemArtCell('sword', 0));
    expect(itemArtCell('sword', 1.5)).toEqual(itemArtCell('sword', 0));
  });
});

describe('iconKind', () => {
  it('draws anything eaten or drunk from the pack as a supply, not a sword', () => {
    expect(iconKind({ name: 'Potion', use: { hp: 20 } })).toBe('food');
    expect(iconKind({ name: 'Bread', use: { hp: 0, food: 10 } })).toBe('food');
  });
});
