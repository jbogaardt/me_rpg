import { describe, expect, it } from 'vitest';
import {
  LOCK_FLASH,
  SPARKS,
  SPARK_LIFE,
  TELL_COLOR,
  TELL_HOT,
  crouch,
  flush,
  leanPx,
  markLook,
  marksShown,
  mixColor,
  shadowAlpha,
  shadowScale,
  sparkAt,
  squashX,
  squashY,
} from './tellLook';

describe('the windup look', () => {
  it('the body coils to full at the aim lock and holds', () => {
    expect(crouch(0, 0.5)).toBe(0);
    expect(crouch(0.25, 0.5)).toBeCloseTo(0.5, 5);
    expect(crouch(0.5, 0.5)).toBe(1);
    expect(crouch(0.9, 0.5)).toBe(1);
    expect(squashY(1)).toBeLessThan(1);
    expect(squashX(1)).toBeGreaterThan(1);
    expect(Number.isInteger(leanPx(0.37))).toBe(true); // whole pixels
  });

  it('the shadow grows in quarter steps (whole pixels on its 28 px sprite) and darkens', () => {
    for (let p = 0; p <= 1; p += 0.05) expect(Number.isInteger(shadowScale(p) * 4)).toBe(true);
    expect(shadowScale(1)).toBeGreaterThan(shadowScale(0));
    expect(shadowAlpha(1)).toBeGreaterThan(shadowAlpha(0));
  });

  it('marks appear one by one and are all there at the lock', () => {
    expect(marksShown(0, 4, 0.5)).toBe(0);
    expect(marksShown(0.5, 4, 0.5)).toBe(4);
    let last = 0;
    for (let p = 0; p <= 1; p += 0.02) {
      const n = marksShown(p, 6, 0.5);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  it('the body flush throbs, then ends solid', () => {
    expect(flush(0.9, 0.5, 0.55)).toBe(1);
    const seen = new Set<number>();
    for (let t = 0; t < 0.25; t += 0.005) seen.add(flush(0.3, t, 0.55));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('mixes colours', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mixColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it('marks are danger orange before the lock, near-white at it, and never green', () => {
    const o = { color: 0, alpha: 0 };
    markLook(o, 1, 4, 0.3, -0.1, false);
    expect(o.color).toBe(TELL_COLOR);
    expect(o.alpha * 4).toBeCloseTo(Math.round(o.alpha * 4), 5); // a quarter step
    markLook(o, 1, 4, 0.5, LOCK_FLASH / 2, false);
    expect(o.color).toBe(TELL_HOT);
    expect(o.alpha).toBe(1);
    for (const c of [TELL_COLOR, TELL_HOT]) expect((c >> 16) & 255).toBeGreaterThan((c >> 8) & 255); // red over green
  });

  it('a line attack runs one bright mark along its line after the lock', () => {
    const o = { color: 0, alpha: 0 };
    const lit = new Set<number>();
    for (let i = 0; i < 6; i++) {
      markLook(o, i, 6, 0.7, 0.3, true);
      if (o.color === TELL_HOT) lit.add(i);
    }
    expect(lit.size).toBe(1);
  });

  it('sparks fly out for a moment after the lock and are gone after', () => {
    const o = { x: 0, y: 0, alpha: 0 };
    expect(sparkAt(o, 0, -0.01)).toBe(false);
    expect(sparkAt(o, 0, SPARK_LIFE + 0.01)).toBe(false);
    for (let i = 0; i < SPARKS; i++) expect(sparkAt(o, i, 0.05)).toBe(true);
    sparkAt(o, 0, 0.02);
    const near = Math.hypot(o.x, o.y);
    sparkAt(o, 0, 0.15);
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(near);
  });
});
