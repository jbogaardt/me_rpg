import { describe, expect, it } from 'vitest';
import { nextZone, zoneName } from './places';

describe('places', () => {
  it('falls back to the key for a zone with no name', () => {
    expect(zoneName('nowhere')).toBe('nowhere');
    expect(zoneName('town')).toBe('Lanternrest');
  });

  it('finds the way to the nearest goal', () => {
    expect(nextZone('town', ['town'])).toBeNull();
    expect(nextZone('town', ['greenwood'])).toBe('greenwood');
    expect(nextZone('town', ['desert'])).toBe('greenwood');
    expect(nextZone('greenwood', ['frostlands', 'desert'])).toBe('desert'); // the desert is one step, the Frostlands two
    expect(nextZone('shop_smithy', ['frostlands'])).toBe('town');
    expect(nextZone('greenwood', ['frostlands'])).toBe('town');
    expect(nextZone('town', ['nowhere'])).toBeNull();
  });
});
