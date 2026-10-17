import { describe, expect, it } from 'vitest';
import { blinkAlpha, HIT_PAUSE_MAX, HIT_PAUSE_MIN, hitPauseFor, isInvulnerable, tickPause } from './hitPause';

describe('hit pause', () => {
  it('stays within 100-150ms and grows with the blow', () => {
    expect(hitPauseFor(1, 100)).toBeGreaterThanOrEqual(HIT_PAUSE_MIN);
    expect(hitPauseFor(1, 100)).toBeLessThan(hitPauseFor(20, 100));
    expect(hitPauseFor(500, 100)).toBe(HIT_PAUSE_MAX);
    expect(hitPauseFor(5, 0)).toBe(HIT_PAUSE_MAX);
  });
  it('runs down to zero and no further', () => {
    expect(tickPause(0.1, 0.04)).toBeCloseTo(0.06);
    expect(tickPause(0.1, 1)).toBe(0);
  });
});

describe('i-frames', () => {
  it('is invulnerable only while the timer runs', () => {
    expect(isInvulnerable(0.5)).toBe(true);
    expect(isInvulnerable(0)).toBe(false);
  });
  it('blinks while invulnerable and is solid otherwise', () => {
    expect(blinkAlpha(0)).toBe(1);
    const seen = new Set([0.8, 0.77, 0.74, 0.7, 0.66, 0.62].map(blinkAlpha));
    expect(seen).toEqual(new Set([0.35, 1]));
  });
});
