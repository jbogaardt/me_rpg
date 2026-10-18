import { describe, expect, it } from 'vitest';
import { BACKDROPS, factors, isBackdrop, tileOffset } from './backdrop';

describe('backdrop', () => {
  it('scrolls the far layer least, and not at all apart from the floor at depth 0', () => {
    expect(factors(0)).toEqual({ far: 1, near: 1 });
    const f = factors(0.6);
    expect(f.far).toBeCloseTo(0.4);
    expect(f.far).toBeLessThan(f.near);
    expect(f.near).toBeLessThan(1);
    expect(factors(5).far).toBe(0); // clamped
  });

  it('slides the texture by whole pixels, a share of the camera', () => {
    expect(tileOffset({ x: 100, y: 50 }, 0.4)).toEqual({ x: -40, y: -20 });
    expect(tileOffset({ x: 101, y: 0 }, 0.5).x).toBe(-51);
  });

  it('names the backdrops a map may ask for', () => {
    for (const name of Object.keys(BACKDROPS)) expect(isBackdrop(name)).toBe(true);
    expect(isBackdrop('moon')).toBe(false);
  });
});
