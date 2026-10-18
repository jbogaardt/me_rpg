import { describe, expect, it } from 'vitest';
import { ledgeAt, landingOf } from './ledges';
import { CELL } from './types';

const ledge = { col: 10, row: 6, w: 3, land: 9 };

describe('ledges', () => {
  it('finds the ledge only on its edge row, across its width', () => {
    expect(ledgeAt([ledge], 11 * CELL + 5, 6 * CELL + 20)).toBe(ledge);
    expect(ledgeAt([ledge], 13 * CELL, 6 * CELL + 1)).toBeUndefined(); // one past the right end
    expect(ledgeAt([ledge], 11 * CELL, 5 * CELL + 31)).toBeUndefined(); // a row above
    expect(ledgeAt(undefined, 0, 0)).toBeUndefined();
  });

  it('lands straight below in the middle of the cell, clamped to the ledge', () => {
    expect(landingOf(ledge, 11 * CELL + 3)).toEqual({ x: 11 * CELL + CELL / 2, y: 9 * CELL + CELL / 2 });
    expect(landingOf(ledge, 40 * CELL).x).toBe(12 * CELL + CELL / 2);
  });
});
