import { describe, expect, it } from 'vitest';
import {
  coverRadius,
  ease,
  IRIS_CLOSE,
  IRIS_DARK,
  IRIS_OPEN,
  irisAt,
  rimAlpha,
  settleAt,
  SETTLE,
  TRANSITION_LENGTH,
} from './transition';

describe('door transition', () => {
  it('eases from 0 to 1 and clamps outside', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
  });

  it('closes the iris on the old view, stays dark, then opens on the new one', () => {
    expect(irisAt(0)).toEqual({ open: 1, closing: true });
    expect(irisAt(IRIS_CLOSE / 2).open).toBeCloseTo(0.5);
    expect(irisAt(IRIS_CLOSE + IRIS_DARK / 2)).toEqual({ open: 0, closing: false });
    expect(irisAt(IRIS_CLOSE + IRIS_DARK + IRIS_OPEN / 2).open).toBeCloseTo(0.5);
    expect(irisAt(TRANSITION_LENGTH).open).toBe(1);
    expect(irisAt(10, true)).toEqual({ open: 0, closing: false }); // held shut while the zone loads
  });

  it('settles the new zone in from a closer shot as the circle opens', () => {
    expect(settleAt(IRIS_CLOSE)).toBeCloseTo(1 + SETTLE);
    expect(settleAt(IRIS_CLOSE + IRIS_DARK + IRIS_OPEN / 2)).toBeCloseTo(1 + SETTLE / 2);
    expect(settleAt(TRANSITION_LENGTH)).toBeCloseTo(1);
    expect(settleAt(99, true)).toBeCloseTo(1 + SETTLE); // still shut: still close
  });

  it('shows the rim while the circle is small and drops it as it clears the screen', () => {
    expect(rimAlpha(0)).toBe(1);
    expect(rimAlpha(0.5)).toBe(1);
    expect(rimAlpha(0.9)).toBeCloseTo(0.4);
    expect(rimAlpha(1)).toBe(0);
  });

  it('covers the whole screen from any centre', () => {
    expect(coverRadius(0, 0, 30, 40)).toBe(50);
    expect(coverRadius(15, 20, 30, 40)).toBe(25);
    expect(coverRadius(30, 0, 30, 40)).toBe(50);
  });
});
