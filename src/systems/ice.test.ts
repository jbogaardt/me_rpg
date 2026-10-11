import { describe, expect, it } from 'vitest';
import { ICE_ACCEL, isIce, stepVelocity } from './ice';
import type { MapData } from '../map/types';

const still = { x: 0, y: 0 };
const right = { x: 1, y: 0 };

describe('stepVelocity', () => {
  it('gives exactly the walking velocity off ice', () => {
    expect(stepVelocity({ x: 99, y: 3 }, right, 120, 0.016, false)).toEqual({ x: 120, y: 0 });
    expect(stepVelocity({ x: 99, y: 3 }, still, 120, 0.016, false)).toEqual({ x: 0, y: 0 });
  });

  it('speeds up gradually on ice', () => {
    const v = stepVelocity(still, right, 120, 0.1, true);
    expect(v.x).toBeCloseTo(ICE_ACCEL * 0.1);
    expect(v.x).toBeLessThan(120);
    let w = still;
    for (let i = 0; i < 60; i++) w = stepVelocity(w, right, 120, 1 / 60, true);
    expect(w).toEqual({ x: 120, y: 0 });
  });

  it('keeps coasting after the keys are released, then stops', () => {
    let v = { x: 120, y: 0 };
    v = stepVelocity(v, still, 120, 0.1, true);
    expect(v.x).toBeGreaterThan(100);
    for (let i = 0; i < 600; i++) v = stepVelocity(v, still, 120, 1 / 60, true);
    expect(v).toEqual({ x: 0, y: 0 });
  });

  it('turns slowly: reversing passes through a slow patch', () => {
    const v = stepVelocity({ x: 120, y: 0 }, { x: -1, y: 0 }, 120, 0.1, true);
    expect(v.x).toBeGreaterThan(0);
  });
});

describe('isIce', () => {
  const data = { width: 2, height: 1, surfaces: ['grass', 'ice'], surface: [0, 1] } as unknown as MapData;
  it('reads the surface under a point', () => {
    expect(isIce(data, 10, 10)).toBe(false);
    expect(isIce(data, 40, 10)).toBe(true);
    expect(isIce(data, -5, 10)).toBe(false);
    expect(isIce(data, 40, 100)).toBe(false);
  });
});
