import { describe, expect, it } from 'vitest';
import {
  coverRadius,
  ease,
  easeOut,
  IRIS_CLOSE,
  IRIS_DARK,
  IRIS_OPEN,
  irisAt,
  pickTransition,
  transitionLength,
  WARP_TIME,
  warpAt,
} from './transition';

const outdoor = { indoor: false };
const room = { indoor: true };

describe('door transitions', () => {
  it('eases from 0 to 1 and clamps outside', () => {
    for (const f of [ease, easeOut]) {
      expect(f(-1)).toBe(0);
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(f(2)).toBe(1);
    }
    expect(ease(0.5)).toBe(0.5);
    expect(easeOut(0.5)).toBeGreaterThan(0.5); // a push-in is quick at first
  });

  it('irises into and out of rooms, and when not going across the world (waking after a defeat)', () => {
    expect(pickTransition(outdoor, room, 'up').kind).toBe('iris');
    expect(pickTransition(room, outdoor, 'down').kind).toBe('iris');
    expect(pickTransition(outdoor, outdoor).kind).toBe('iris');
  });

  it('warps between open-air zones, toward the way the gap goes', () => {
    expect(pickTransition(outdoor, outdoor, 'up')).toEqual({ kind: 'warp', dir: 'up' });
    expect(pickTransition(outdoor, outdoor, 'left')).toEqual({ kind: 'warp', dir: 'left' });
  });

  it('closes the iris on the old view, stays dark, then opens on the new one', () => {
    expect(irisAt(0)).toEqual({ open: 1, closing: true });
    expect(irisAt(IRIS_CLOSE / 2).open).toBeCloseTo(0.5);
    expect(irisAt(IRIS_CLOSE + IRIS_DARK / 2)).toEqual({ open: 0, closing: false });
    expect(irisAt(IRIS_CLOSE + IRIS_DARK + IRIS_OPEN / 2).open).toBeCloseTo(0.5);
    expect(irisAt(transitionLength('iris')).open).toBe(1);
    expect(irisAt(10, true)).toEqual({ open: 0, closing: false }); // held shut while the zone loads
  });

  it('covers the whole screen from any centre', () => {
    expect(coverRadius(0, 0, 30, 40)).toBe(50);
    expect(coverRadius(15, 20, 30, 40)).toBe(25);
    expect(coverRadius(30, 0, 30, 40)).toBe(50);
  });
});

describe('warp', () => {
  it('starts as the old view untouched and ends as the new view alone', () => {
    const a = warpAt(0, 'up', 640, 480);
    expect(a.old).toEqual({ scale: 1, alpha: 1, x: 0, y: 0 });
    expect(a.flash).toBe(0);
    expect(a.fresh.scale).toBeCloseTo(1.14);
    const z = warpAt(WARP_TIME, 'up', 640, 480);
    expect(z.old.alpha).toBe(0);
    expect(z.fresh).toEqual({ scale: 1, x: 0, y: 0 });
    expect(z.flash).toBeCloseTo(0);
    expect(transitionLength('warp')).toBe(WARP_TIME);
  });

  it('flashes in the middle, and the old view dissolves while it zooms in', () => {
    const mid = warpAt(WARP_TIME * 0.2, 'right', 640, 480);
    expect(mid.flash).toBeCloseTo(0.5);
    expect(mid.old.scale).toBeGreaterThan(1);
    expect(mid.old.alpha).toBeLessThan(1);
    let last = 1;
    for (let t = 0; t <= WARP_TIME; t += WARP_TIME / 40) {
      const alpha = warpAt(t, 'right', 640, 480).old.alpha;
      expect(alpha).toBeLessThanOrEqual(last); // never flickers back
      last = alpha;
    }
  });

  it('drifts the old view the way the player went and the new one in from that side', () => {
    const w = warpAt(WARP_TIME * 0.3, 'right', 640, 480);
    expect(w.old.x).toBeLessThan(0);
    expect(w.fresh.x).toBeGreaterThan(0);
    expect(w.old.y).toBe(0);
    const up = warpAt(WARP_TIME * 0.3, 'up', 640, 480);
    expect(up.old.y).toBeGreaterThan(0);
    expect(up.fresh.y).toBeLessThan(0);
  });
});
