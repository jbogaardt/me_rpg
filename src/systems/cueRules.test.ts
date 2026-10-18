import { describe, expect, it } from 'vitest';
import {
  GRAZE_SHARE,
  HEAVY_SHARE,
  HIT_FX,
  HURT_HEAVY_SHARE,
  HUNGER_COLOR,
  NO_STRAIN,
  THIRST_COLOR,
  WOUND_COLOR,
  heartbeat,
  hitTier,
  hurtFx,
  refusalFx,
  strainOf,
  washTint,
  wilting,
} from './cueRules';
import { PARTICLE_EFFECTS } from './particleEffects';
import { lowHealth } from './downfall';

const fed = { food: 100, water: 100 };

describe('a blow on a foe', () => {
  it('is a graze under an eighth of its health, solid in between, heavy from a third', () => {
    expect(hitTier(1, 20, false)).toBe('graze');
    expect(hitTier(20 * GRAZE_SHARE, 20, false)).toBe('solid');
    expect(hitTier(20 * HEAVY_SHARE - 0.1, 20, false)).toBe('solid');
    expect(hitTier(20 * HEAVY_SHARE, 20, false)).toBe('heavy');
  });
  it('is always heavy when it kills, and never divides by nothing', () => {
    expect(hitTier(1, 500, true)).toBe('heavy');
    expect(hitTier(1, 0, false)).toBe('heavy');
  });
  it('maps each tier to an effect that exists, the plain spark being the middle', () => {
    expect(HIT_FX.solid).toBe('hitSpark');
    for (const fx of Object.values(HIT_FX)) expect(fx in PARTICLE_EFFECTS).toBe(true);
  });
});

describe('a blow on the hero', () => {
  it('is heavy from a quarter of their health', () => {
    expect(hurtFx(24, 100)).toBe('heroHurt');
    expect(hurtFx(100 * HURT_HEAVY_SHARE, 100)).toBe('heroHurtHeavy');
    expect(hurtFx(5, 0)).toBe('heroHurtHeavy');
  });
});

describe('refusals', () => {
  it('are one cue, whatever the reason, and it is a real effect', () => {
    for (const why of ['noRoom', 'packFull', 'locked', 'noMana', 'noTarget', 'nothingToDo', 'trial'] as const) {
      expect(refusalFx(why)).toBe('deny');
    }
    expect('deny' in PARTICLE_EFFECTS).toBe(true);
  });
});

describe("the hero's body", () => {
  it('shows nothing when well and fed', () => {
    expect(strainOf(100, 100, fed, 3)).toEqual(NO_STRAIN);
  });
  it('pulses red with the heartbeat at low health, harder the lower', () => {
    const at = (hp: number, clock: number) => strainOf(hp, 100, fed, clock);
    expect(at(30, 1).color).toBe(WOUND_COLOR);
    expect(at(30, 1).amount).toBeGreaterThan(0.1);
    const rate = 4 + 4 * lowHealth(10, 100);
    const peak = Math.PI / 2 / rate; // the heartbeat's own peak
    expect(at(10, peak).amount).toBeGreaterThan(at(10, peak + Math.PI / rate).amount);
    expect(at(5, peak).amount).toBeGreaterThan(at(30, peak).amount);
    expect(heartbeat(0, 0)).toBeCloseTo(0.75);
  });
  it('washes sallow when hungry and grey-blue when thirsty, more when empty, and red wins', () => {
    expect(strainOf(100, 100, { food: 10, water: 100 }, 1).color).toBe(HUNGER_COLOR);
    expect(strainOf(100, 100, { food: 100, water: 10 }, 1).color).toBe(THIRST_COLOR);
    const low = strainOf(100, 100, { food: 10, water: 100 }, 1).amount;
    const empty = strainOf(100, 100, { food: 0, water: 100 }, 1).amount;
    expect(empty).toBeGreaterThan(low);
    expect(strainOf(20, 100, { food: 0, water: 0 }, 1).color).toBe(WOUND_COLOR);
  });
  it('wilts only when a meter is empty', () => {
    expect(wilting({ food: 5, water: 50 })).toBe(false);
    expect(wilting({ food: 0, water: 50 })).toBe(true);
    expect(wilting({ food: 50, water: 0 })).toBe(true);
  });
  it('washes a tint toward a colour channel by channel', () => {
    expect(washTint(0xffffff, 0xff0000, 0)).toBe(0xffffff);
    expect(washTint(0xffffff, 0xff0000, 1)).toBe(0xff0000);
    expect(washTint(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(washTint(0xa8d8ff, 0xff4040, 5)).toBe(0xff4040);
  });
});
