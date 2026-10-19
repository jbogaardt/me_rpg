import { describe, expect, it } from 'vitest';
import { castleTrim, smithyTrim } from './trim';
import { MAX_LEVEL } from './sim/races';

describe('building trim', () => {
  it('grows a castle with each level', () => {
    const t = Array.from({ length: MAX_LEVEL }, (_, i) => castleTrim(i + 1));
    expect(t[0]).toEqual({ scale: 1, pennants: 0, ring: false });
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.scale).toBeGreaterThan(t[i - 1]!.scale);
      expect(t[i]!.pennants).toBeGreaterThan(t[i - 1]!.pennants);
    }
    expect(t[MAX_LEVEL - 1]!.ring).toBe(true);
  });

  it('grows a smithy as upgrades are bought and stops at the top step', () => {
    expect(smithyTrim(0)).toEqual({ scale: 1, pennants: 0, ring: false });
    expect(smithyTrim(2).pennants).toBe(0);
    expect(smithyTrim(3).pennants).toBe(1);
    expect(smithyTrim(9)).toEqual(smithyTrim(100));
    expect(smithyTrim(9).ring).toBe(true);
  });
});
