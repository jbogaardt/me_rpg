import { describe, expect, it } from 'vitest';
import { AIM_STEPS, aimToward, decodeAim, encodeAim, loadAimMode, saveAimMode } from './aim';

describe('aimToward', () => {
  it('is the unit vector toward the point', () => {
    expect(aimToward(0, 0, 30, 40)).toEqual({ x: 0.6, y: 0.8 });
  });
  it('has no aim on top of the player', () => {
    expect(aimToward(10, 10, 11, 11)).toBeNull();
  });
});

describe('aim on the wire', () => {
  it('fits 1..AIM_STEPS and comes back close to the original direction', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const aim = { x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) };
      const code = encodeAim(aim);
      expect(code).toBeGreaterThanOrEqual(1);
      expect(code).toBeLessThanOrEqual(AIM_STEPS);
      const back = decodeAim(code);
      expect(back.x * aim.x + back.y * aim.y).toBeGreaterThan(Math.cos(Math.PI / AIM_STEPS) - 1e-9);
    }
  });
  it('is exact along the four axes', () => {
    for (const aim of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ]) {
      const back = decodeAim(encodeAim(aim));
      expect(back.x).toBeCloseTo(aim.x);
      expect(back.y).toBeCloseTo(aim.y);
    }
  });
});

describe('aim mode storage', () => {
  const store = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };
  it('defaults to movement aim and round-trips the mouse choice', () => {
    const s = store();
    expect(loadAimMode(s)).toBe('move');
    saveAimMode('mouse', s);
    expect(loadAimMode(s)).toBe('mouse');
    saveAimMode('move', s);
    expect(loadAimMode(s)).toBe('move');
  });
  it('ignores junk', () => {
    expect(loadAimMode({ getItem: () => 'sideways' })).toBe('move');
  });
});
