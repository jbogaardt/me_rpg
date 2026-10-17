import { describe, expect, it } from 'vitest';
import { clampAnchor, clampDeadzone, DEFAULT_STICK, followAnchor, parseStick, stickDirs } from './stick';

describe('stickDirs', () => {
  it('does nothing inside the deadzone', () => {
    expect(stickDirs(10, 0, 70, 0.25).size).toBe(0);
    expect(stickDirs(0, 0, 70, 0.25).size).toBe(0);
  });
  it('a bigger deadzone swallows a bigger offset', () => {
    expect(stickDirs(30, 0, 70, 0.25)).toEqual(new Set(['right']));
    expect(stickDirs(30, 0, 70, 0.6).size).toBe(0);
  });
  it('makes diagonals', () => {
    expect(stickDirs(40, -40, 70, 0.25)).toEqual(new Set(['right', 'up']));
    expect(stickDirs(-50, 5, 70, 0.25)).toEqual(new Set(['left']));
  });
});

describe('settings', () => {
  it('falls back to defaults and clamps', () => {
    expect(parseStick(null)).toEqual(DEFAULT_STICK);
    expect(parseStick({ mode: 'fixed', deadzone: 5 })).toEqual({ mode: 'fixed', deadzone: 0.6 });
    expect(parseStick({ mode: 'x', deadzone: 'a' })).toEqual(DEFAULT_STICK);
    expect(clampDeadzone(NaN)).toBe(DEFAULT_STICK.deadzone);
  });
});

describe('floating anchor', () => {
  it('stays on screen', () => {
    expect(clampAnchor(5, 5, 70, 400, 300)).toEqual({ x: 70, y: 70 });
    expect(clampAnchor(395, 295, 70, 400, 300)).toEqual({ x: 330, y: 230 });
  });
  it('follows a thumb that leaves the rim and ignores one inside', () => {
    expect(followAnchor(100, 100, 150, 100, 70)).toEqual({ x: 100, y: 100 });
    const a = followAnchor(100, 100, 270, 100, 70);
    expect(a.x).toBeCloseTo(200);
    expect(a.y).toBeCloseTo(100);
  });
});
