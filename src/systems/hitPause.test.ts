import { describe, expect, it } from 'vitest';
import {
  BOSS_KILL_PAUSE,
  HERO_HURT_PAUSE,
  HERO_PAUSE_MAX,
  HERO_PAUSE_MIN,
  KILL_PAUSE,
  KNOCK_CAP,
  KNOCK_DECAY,
  KNOCK_SHOVE,
  KNOCK_SPEED,
  heroPauseFor,
  killPauseFor,
  knockVelocity,
  blinkAlpha,
  HIT_PAUSE_MAX,
  HIT_PAUSE_MIN,
  hitPauseFor,
  isInvulnerable,
  tickPause,
} from './hitPause';

describe('hit pause', () => {
  it('stays within 100-150ms and grows with the blow', () => {
    expect(hitPauseFor(1, 100)).toBeGreaterThanOrEqual(HIT_PAUSE_MIN);
    expect(hitPauseFor(1, 100)).toBeLessThan(hitPauseFor(20, 100));
    expect(hitPauseFor(500, 100)).toBe(HIT_PAUSE_MAX);
    expect(hitPauseFor(5, 0)).toBe(HIT_PAUSE_MAX);
  });
  it('runs down to zero and no further', () => {
    expect(tickPause(0.1, 0.04)).toBeCloseTo(0.06);
    expect(tickPause(0.1, 1)).toBe(0);
  });
});

describe('i-frames', () => {
  it('is invulnerable only while the timer runs', () => {
    expect(isInvulnerable(0.5)).toBe(true);
    expect(isInvulnerable(0)).toBe(false);
  });
  it('blinks while invulnerable and is solid otherwise', () => {
    expect(blinkAlpha(0)).toBe(1);
    const seen = new Set([0.8, 0.77, 0.74, 0.7, 0.66, 0.62].map(blinkAlpha));
    expect(seen).toEqual(new Set([0.35, 1]));
  });
});

describe('attacker hit-pause', () => {
  it('holds the hero 50-70ms on a hit, growing with the blow', () => {
    expect(heroPauseFor(1, 100, false, false)).toBeCloseTo(HERO_PAUSE_MIN, 2);
    expect(heroPauseFor(1, 100, false, false)).toBeLessThan(heroPauseFor(30, 100, false, false));
    expect(heroPauseFor(500, 100, false, false)).toBeCloseTo(HERO_PAUSE_MAX);
    expect(HERO_PAUSE_MIN).toBeGreaterThanOrEqual(0.05);
    expect(HERO_PAUSE_MAX).toBeLessThanOrEqual(0.07);
  });
  it('holds longer on a kill, longest on a boss kill, and shorter than the sword cooldown', () => {
    expect(heroPauseFor(1, 100, true, false)).toBe(KILL_PAUSE);
    expect(KILL_PAUSE).toBeGreaterThanOrEqual(0.1);
    expect(KILL_PAUSE).toBeLessThanOrEqual(0.12);
    expect(heroPauseFor(1, 100, true, true)).toBe(BOSS_KILL_PAUSE);
    expect(killPauseFor(true)).toBeGreaterThan(killPauseFor(false));
    expect(BOSS_KILL_PAUSE).toBeLessThanOrEqual(0.2);
    expect(KILL_PAUSE).toBeGreaterThan(HERO_PAUSE_MAX);
    expect(HERO_HURT_PAUSE).toBeCloseTo(0.08);
  });
  it('is a hold only: the pause ticks down on the same clock as everything else', () => {
    let left = heroPauseFor(10, 100, true, false);
    let frames = 0;
    while (left > 0) {
      left = tickPause(left, 1 / 60);
      frames++;
    }
    expect(frames).toBe(7); // 0.11 s at 60 Hz
  });
});

describe('foe knockback', () => {
  /** What a foe travels at 60 Hz sliding along `v` with the decay the mob uses. */
  function travelled(v: { x: number; y: number }, dt = 1 / 60) {
    let x = 0;
    let k = { ...v };
    for (let i = 0; i < 120 && (k.x || k.y); i++) {
      x += k.x * dt;
      const d = Math.exp(-KNOCK_DECAY * dt);
      k = { x: k.x * d, y: k.y * d };
      if (Math.hypot(k.x, k.y) < 5) k = { x: 0, y: 0 };
    }
    return x;
  }
  it('carries a hit 24-32 px, starting on the first tick', () => {
    const v = knockVelocity(1, 0, KNOCK_SPEED);
    expect(v.x * (1 / 60)).toBeGreaterThan(4); // the first tick already moves it ~5 px
    const d = travelled(v);
    expect(d).toBeGreaterThanOrEqual(24);
    expect(d).toBeLessThanOrEqual(32);
  });
  it('only nudges a poised foe and never flings one past the cap', () => {
    expect(travelled(knockVelocity(1, 0, KNOCK_SHOVE))).toBeLessThan(12);
    const big = knockVelocity(2.6, 0, KNOCK_SPEED);
    expect(Math.hypot(big.x, big.y)).toBeCloseTo(KNOCK_CAP);
    expect(knockVelocity(0, 0, KNOCK_SPEED)).toEqual({ x: 0, y: 0 });
  });
});
