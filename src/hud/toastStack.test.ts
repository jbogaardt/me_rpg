import { describe, expect, it } from 'vitest';
import { MAX_TOASTS, pushToast, TOAST_COMBAT_SECONDS, TOAST_SECONDS, tickToasts, toastLabel } from './toastStack';

describe('pickup toasts', () => {
  it('stacks, merges repeats and drops the oldest', () => {
    let s = pushToast([], 'Potion', false);
    s = pushToast(s, 'Potion', false);
    expect(s).toHaveLength(1);
    expect(toastLabel(s[0]!)).toBe('Potion x2');
    for (const n of ['a', 'b', 'c', 'd']) s = pushToast(s, n, false);
    expect(s).toHaveLength(MAX_TOASTS);
    expect(s.map((t) => t.text)).toEqual(['b', 'c', 'd']);
  });
  it('is shorter in combat', () => {
    expect(pushToast([], 'x', true)[0]!.left).toBe(TOAST_COMBAT_SECONDS);
    const s = pushToast([], 'x', false);
    expect(s[0]!.left).toBe(TOAST_SECONDS);
    expect(tickToasts(s, 0.1, true)[0]!.left).toBeCloseTo(TOAST_COMBAT_SECONDS - 0.1);
  });
  it('expires', () => {
    expect(tickToasts(pushToast([], 'x', false), TOAST_SECONDS + 0.1, false)).toEqual([]);
  });
});
