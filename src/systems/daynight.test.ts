import { describe, expect, it } from 'vitest';
import { clockText, DAY_LENGTH, DayClock, FADE_SECONDS, daylight, isNight, mix, skyColor } from './daynight';

describe('day and night', () => {
  it('is bright at noon and dark at midnight', () => {
    expect(skyColor(0.5)).toBe(0xffffff);
    expect(daylight(0.5)).toBe(1);
    expect(daylight(0)).toBe(0);
    expect(isNight(0)).toBe(true);
    expect(isNight(0.5)).toBe(false);
  });

  it('wraps smoothly at midnight', () => {
    expect(skyColor(0)).toBe(skyColor(1));
    expect(skyColor(1.5)).toBe(skyColor(0.5));
    expect(skyColor(-0.5)).toBe(skyColor(0.5));
  });

  it('never jumps: neighbouring moments are close in colour', () => {
    let last = skyColor(0);
    for (let i = 1; i <= 1000; i++) {
      const c = skyColor(i / 1000);
      for (const shift of [16, 8, 0]) expect(Math.abs(((c >> shift) & 255) - ((last >> shift) & 255))).toBeLessThan(12);
      last = c;
    }
  });

  it('gets brighter through the morning and darker through the evening', () => {
    expect(daylight(0.3)).toBeGreaterThan(daylight(0.22));
    expect(daylight(0.74)).toBeGreaterThan(daylight(0.9));
  });

  it('mixes colours', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0x102030, 0x102030, 0.7)).toBe(0x102030);
  });

  it('reads the clock', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(0.5)).toBe('12:00');
    expect(clockText(0.25)).toBe('6:00');
  });

  it('follows the wall clock, so every player sees the same hour', () => {
    const a = new DayClock(() => 5000);
    const b = new DayClock(() => 5000);
    expect(a.time()).toBe(b.time());
    expect(new DayClock(() => DAY_LENGTH * 1000 * 3.25).time()).toBeCloseTo(0.25);
  });

  it('can be set to an hour', () => {
    const clock = new DayClock(() => 123456);
    clock.setHour(18);
    expect(clock.time()).toBeCloseTo(0.75);
    clock.setHour(0);
    expect(clock.time()).toBeCloseTo(0, 5);
  });

  it('eases to a new hour instead of cutting', () => {
    let t = 1000 * DAY_LENGTH * 0.5; // noon
    const clock = new DayClock(() => t);
    expect(clock.sky()).toBe(0xffffff);
    clock.setHour(0);
    const lum = (c: number) => (c >> 16) & 255;
    const first = lum(clock.sky());
    t += (FADE_SECONDS / 2) * 1000;
    const mid = lum(clock.sky());
    t += FADE_SECONDS * 1000;
    const last = lum(clock.sky());
    expect(first).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(last);
    expect(clock.sky()).toBe(skyColor(clock.time()));
  });

  it('does not restart the fade when the same shift is sent again', () => {
    let t = 0;
    const clock = new DayClock(() => t);
    clock.shift = 0.3;
    t += 3000;
    const before = clock.sky();
    clock.shift = 0.3;
    expect(clock.sky()).toBe(before);
  });
});
