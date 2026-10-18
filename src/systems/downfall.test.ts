import { describe, expect, it } from 'vitest';
import { DOWN_TOTAL, downCard, downDark, FALL_S, lowHealth, wakeDark, WAKE_S } from './downfall';

describe('the fall', () => {
  it('is clear at the blow, dark by the time of waking, and darkens steadily', () => {
    expect(downDark(0)).toBe(0);
    expect(downDark(DOWN_TOTAL)).toBe(1);
    let last = 0;
    for (let t = 0; t <= DOWN_TOTAL; t += 0.05) {
      expect(downDark(t)).toBeGreaterThanOrEqual(last);
      last = downDark(t);
    }
  });

  it('shows the card only once the hero is down', () => {
    expect(downCard(FALL_S * 0.5)).toBe(0);
    expect(downCard(DOWN_TOTAL)).toBe(1);
  });

  it('comes back from black after waking', () => {
    expect(wakeDark(0)).toBe(1);
    expect(wakeDark(WAKE_S)).toBe(0);
  });
});

describe('lowHealth', () => {
  it('shows nothing when well, and more as HP runs out', () => {
    expect(lowHealth(100, 100)).toBe(0);
    expect(lowHealth(34, 100)).toBe(0);
    expect(lowHealth(22, 100)).toBeGreaterThan(0.4);
    expect(lowHealth(5, 100)).toBe(1);
    expect(lowHealth(0, 100)).toBe(0); // already down: the fall takes over
  });
});
