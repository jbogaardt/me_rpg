import { describe, expect, it } from 'vitest';
import { signLines, signNear } from './signs';

describe('signposts', () => {
  it('names each way with its arrow, north, west, east then south', () => {
    expect(signLines({ down: 'town', right: 'eastwood', up: 'undead', left: 'The Crossroads' })).toEqual([
      '↑ The Barrow Lands\n← The Crossroads\n→ The Eastwood\n↓ Lanternrest',
    ]);
  });

  it('finds the nearest sign within reach that the player faces', () => {
    const signs = [
      { col: 2, row: 2, ways: {} },
      { col: 4, row: 2, ways: {} },
    ];
    expect(signNear(signs, 3.8 * 32, 2.5 * 32, 'right', 48)).toBe(signs[1]);
    expect(signNear(signs, 2.5 * 32, 3.9 * 32, 'up', 48)).toBe(signs[0]);
    expect(signNear(signs, 2.5 * 32, 3.9 * 32, 'down', 48)).toBeUndefined(); // turned away from it
    expect(signNear(signs, 10 * 32, 10 * 32, 'up', 48)).toBeUndefined();
  });
});
