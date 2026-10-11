import { describe, expect, it } from 'vitest';
import { approach, glide } from './interp';

describe('smoothing', () => {
  it('approaches the target without overshooting, independent of step size', () => {
    const once = approach(0, 100, 0.1);
    const twice = approach(approach(0, 100, 0.05), 100, 0.05);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(100);
    expect(twice).toBeCloseTo(once, 6);
    expect(approach(5, 5, 0.1)).toBe(5);
  });

  it('glides short moves and snaps teleports', () => {
    const p = { x: 0, y: 0 };
    glide(p, 10, 0, 1 / 60);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(10);
    glide(p, 500, 500, 1 / 60);
    expect(p).toEqual({ x: 500, y: 500 });
  });
});
