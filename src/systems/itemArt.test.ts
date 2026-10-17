import { describe, expect, it } from 'vitest';
import { ITEM_COLS, ITEM_ROWS, itemArtCell } from './itemArt';
import type { IconKind } from './inventory';

const KINDS: IconKind[] = [
  'wand',
  'tome',
  'sword',
  'bow',
  'dagger',
  'shield',
  'helm',
  'armor',
  'greaves',
  'boot',
  'cape',
  'tool',
  'sack',
  'backpack',
  'charm',
  'gem',
  'food',
];

describe('itemArtCell', () => {
  it('gives every kind but the greaves its own cell inside the sheet', () => {
    const seen = new Set<string>();
    for (const kind of KINDS) {
      const cell = itemArtCell(kind);
      if (kind === 'greaves') {
        expect(cell).toBeUndefined();
        continue;
      }
      expect(cell).toBeDefined();
      expect(cell!.col).toBeLessThan(ITEM_COLS);
      expect(cell!.row).toBeLessThan(ITEM_ROWS);
      seen.add(`${cell!.col},${cell!.row}`);
    }
    expect(seen.size).toBe(KINDS.length - 1);
  });
});
