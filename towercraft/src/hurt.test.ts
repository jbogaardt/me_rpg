import { describe, expect, it } from 'vitest';
import { FLASH_TIME, HurtTracker, flashOf, mixColor, readableScale } from './hurt';

describe('hit feedback', () => {
  it('a flash is strongest at the blow and gone after FLASH_TIME', () => {
    expect(flashOf(0)).toBe(1);
    expect(flashOf(FLASH_TIME)).toBe(0);
    expect(flashOf(FLASH_TIME / 2)).toBeGreaterThan(0);
    expect(flashOf(-1)).toBe(0);
  });

  it('mixes colours channel by channel', () => {
    expect(mixColor(0xffffff, 0x000000, 0.5)).toBe(0x808080);
    expect(mixColor(0x102030, 0x102030, 0.7)).toBe(0x102030);
  });

  it('finds a hit from a drop in health and eases the bar', () => {
    const t = new HurtTracker();
    t.begin();
    t.touch(1, 10, 10, 0, 0.016);
    expect(t.flash(1, 0)).toBe(0);
    t.end();
    t.begin();
    const s = t.touch(1, 6, 10, 1, 0.016);
    expect(t.flash(1, 1)).toBe(1);
    expect(s.shown).toBeGreaterThan(0.6); // has not jumped to 0.6
    expect(s.chip).toBe(1); // the chip waits
    for (let i = 0; i < 200; i++) t.touch(1, 6, 10, 2 + i * 0.016, 0.016);
    expect(t.touch(1, 6, 10, 6, 0.016).shown).toBeCloseTo(0.6, 2);
    t.end();
  });

  it('forgets things it stopped seeing', () => {
    const t = new HurtTracker();
    t.begin();
    t.touch(5, 1, 2, 0, 0.1);
    t.end();
    t.begin();
    t.end();
    expect(t.flash(5, 0.01)).toBe(0);
  });

  it('enlarges only when zoomed far out, up to double', () => {
    expect(readableScale(1)).toBe(1);
    expect(readableScale(0.45)).toBe(1);
    expect(readableScale(0.3)).toBeGreaterThan(1);
    expect(readableScale(0.05)).toBe(2);
  });
});
