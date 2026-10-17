import { describe, expect, it } from 'vitest';
import { landmarkIn, landmarkText } from './landmarks';

describe('landmarkIn', () => {
  it('finds the thing a telling names', () => {
    expect(landmarkIn('A big man is sitting beside a lopsided wagon in the Vale.')).toBe('cart');
    expect(landmarkIn('Meet me at the old well.')).toBe('well');
    expect(landmarkIn('The smoke of a campfire at the edge of town')).toBe('campfire');
    expect(landmarkIn('the old ruins')).toBe('ruin');
  });

  it('takes the first one it names', () => {
    expect(landmarkIn('Past the tower, by the cart, there is a camp.')).toBe('tower');
  });

  it('does not mistake common words for places', () => {
    expect(landmarkIn('Well met, friends. Fare well.')).toBeUndefined();
    expect(landmarkIn('Gather plants that only grow in the Vale.')).toBeUndefined();
  });

  it('reads the place, the DM’s note and the title together', () => {
    expect(landmarkIn(landmarkText({ what: 'Big Ansel', note: 'Find the wagon.', title: 'Find Big Ansel' }))).toBe(
      'cart',
    );
  });
});
