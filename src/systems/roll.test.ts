import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { Collision, type Body } from './collision';
import { AttackBuffer } from './inputBuffer';
import {
  MAX_TRAVEL_GAIN,
  ROLL_COOLDOWN,
  ROLL_DISTANCE,
  ROLL_IFRAMES,
  ROLL_TIME,
  canRoll,
  cooldownShare,
  moveRoll,
  rollDirection,
  rollInvulnerable,
  rollPose,
  rollProgress,
  startRoll,
  stepRoll,
  type RollGate,
  rollTravelGain,
} from './roll';

const TICK = 1 / 60;
const free: RollGate = { cooldown: 0, rolling: false, down: false, stunned: false, dm: false };

describe('the roll move', () => {
  it('lasts 13 frames and covers two and a quarter cells', () => {
    expect(ROLL_TIME * 60).toBeCloseTo(13, 6);
    expect(ROLL_DISTANCE).toBe(2.25 * CELL);
  });

  it('covers exactly its distance however the ticks fall, and ends when its time is up', () => {
    for (const dt of [TICK, 0.1, 0.037, 0.5]) {
      const r = startRoll(1, 0);
      let x = 0;
      let done = false;
      for (let i = 0; i < 100 && !done; i++) {
        const s = stepRoll(r, dt);
        x += s.mx;
        done = s.done;
      }
      expect(done).toBe(true);
      expect(x).toBeCloseTo(ROLL_DISTANCE, 6);
    }
  });

  it('starts fast: more than half the distance in the first third of the time', () => {
    expect(rollProgress(ROLL_TIME / 3)).toBeGreaterThan(0.5);
    expect(rollProgress(0)).toBe(0);
    expect(rollProgress(ROLL_TIME * 2)).toBe(1);
  });

  it('is faster than walking from the first tick, and a diagonal covers the same ground', () => {
    const r = startRoll(Math.SQRT1_2, Math.SQRT1_2);
    const first = stepRoll(r, TICK);
    expect(Math.hypot(first.mx, first.my)).toBeGreaterThan(120 * TICK * 3);
    let x = first.mx;
    let y = first.my;
    for (let i = 1; i < 13; i++) {
      const s = stepRoll(r, TICK);
      x += s.mx;
      y += s.my;
    }
    expect(Math.hypot(x, y)).toBeCloseTo(ROLL_DISTANCE, 5);
  });
});

describe('the i-frame window', () => {
  it('is frames 2 to 7 at 60 Hz: closed at the start and the end, open in the middle', () => {
    const open: number[] = [];
    const r = startRoll(1, 0);
    for (let f = 0; f < 13; f++) {
      r.t = f * TICK + 1e-9;
      if (rollInvulnerable(r)) open.push(f);
    }
    expect(open).toEqual([2, 3, 4, 5, 6, 7]);
    expect(ROLL_IFRAMES.to - ROLL_IFRAMES.from).toBeLessThanOrEqual(0.11);
  });

  it('never grants more than its window, and nothing without a roll', () => {
    expect(rollInvulnerable(null)).toBe(false);
    const r = startRoll(0, 1);
    let safe = 0;
    for (let i = 0; i < 200; i++) {
      stepRoll(r, TICK);
      if (rollInvulnerable(r)) safe += TICK;
    }
    expect(safe).toBeLessThanOrEqual(ROLL_IFRAMES.to - ROLL_IFRAMES.from + TICK);
    expect(rollInvulnerable(r)).toBe(false); // long over: a state left behind grants nothing
  });
});

describe('when a roll may start', () => {
  it('needs no cooldown, no roll in progress, a hero on their feet and not stunned, and not the DM', () => {
    expect(canRoll(free)).toBe(true);
    expect(canRoll({ ...free, cooldown: 0.01 })).toBe(false);
    expect(canRoll({ ...free, rolling: true })).toBe(false);
    expect(canRoll({ ...free, down: true })).toBe(false);
    expect(canRoll({ ...free, stunned: true })).toBe(false);
    expect(canRoll({ ...free, dm: true })).toBe(false);
  });

  it('is no way to travel: rolling on every cooldown beats walking by little', () => {
    expect(rollTravelGain()).toBeGreaterThan(0);
    expect(rollTravelGain()).toBeLessThanOrEqual(MAX_TRAVEL_GAIN);
  });

  it('cannot be chained: the cooldown runs from the start and outlasts the roll', () => {
    expect(ROLL_COOLDOWN).toBeGreaterThan(ROLL_TIME * 2);
    expect(cooldownShare(ROLL_COOLDOWN)).toBe(1);
    expect(cooldownShare(0)).toBe(0);
    expect(cooldownShare(ROLL_COOLDOWN / 2)).toBeCloseTo(0.5, 6);
  });

  it('keeps a press made just before it is legal, and fires it the first legal tick (within 100 ms)', () => {
    const buffer = new AttackBuffer();
    let cooldown = 0.05; // 50 ms to go
    buffer.press('z');
    let firedAt = -1;
    for (let i = 0; i < 20 && firedAt < 0; i++) {
      cooldown = Math.max(0, cooldown - TICK);
      if (buffer.step(TICK, cooldown > 0 ? 1 : 0, 'z')) firedAt = i;
    }
    expect(firedAt).toBeGreaterThanOrEqual(0);
    expect((firedAt + 1) * TICK).toBeLessThan(0.1);
    // a press made long before is not kept: nothing fires by surprise
    buffer.press('z');
    let fired = false;
    for (let i = 0; i < 60; i++) fired ||= buffer.step(TICK, 1, 'z');
    expect(fired).toBe(false);
    expect(buffer.pending).toBe(false);
  });
});

describe('which way', () => {
  it('prefers the keys, then the aim, then the facing, and normalises a diagonal', () => {
    const near = (v: { x: number; y: number }, x: number, y: number) => {
      expect(v.x).toBeCloseTo(x, 6);
      expect(v.y).toBeCloseTo(y, 6);
    };
    near(rollDirection(1, 1, { x: -1, y: 0 }, [0, 1]), Math.SQRT1_2, Math.SQRT1_2);
    near(rollDirection(0, 0, { x: -1, y: 0 }, [0, 1]), -1, 0);
    near(rollDirection(0, 0, { x: 0, y: 0 }, [0, -1]), 0, -1);
    near(rollDirection(0, 0, { x: 0, y: 0 }, [0, 0]), 0, 1); // never a zero vector
  });
});

describe('walls', () => {
  // 12x12 open ground with a wall along column 6 (rows 0-11): a roll east runs into it.
  const wall = Array.from({ length: 12 }, (_, row) => row * 12 + 6);
  const c = new Collision(12, 12, wall);
  const roll = (body: Body, dx: number, dy: number, dt: number) => {
    const r = startRoll(dx, dy);
    for (let i = 0; i < 200; i++) if (moveRoll(r, dt, (mx, my) => c.slide(body, mx, my, []))) return;
  };

  it('never ends inside a wall, whatever the frame length, and stops against it', () => {
    for (const dt of [TICK, 0.05, 0.1]) {
      const b: Body = { x: 6 * CELL - 40, y: 4.5 * CELL };
      roll(b, 1, 0, dt);
      expect(c.fitsMap(b.x, b.y)).toBe(true);
      expect(b.x).toBeLessThan(6 * CELL);
      expect(b.x).toBeGreaterThan(6 * CELL - 10); // it ran up to the wall
    }
  });

  it('slides along a wall on a diagonal, as walking does', () => {
    const b: Body = { x: 6 * CELL - 8, y: 3 * CELL };
    const y0 = b.y;
    roll(b, Math.SQRT1_2, Math.SQRT1_2, TICK);
    expect(b.x).toBeLessThanOrEqual(6 * CELL - 6); // blocked on x: the foot box stays out of the wall
    expect(c.fitsMap(b.x, b.y)).toBe(true);
    expect(b.y).toBeGreaterThan(y0 + ROLL_DISTANCE * Math.SQRT1_2 - 1); // free on y, its full share
  });

  it('goes the whole way in the open', () => {
    const b: Body = { x: 1 * CELL, y: 4.5 * CELL };
    roll(b, 1, 0, 0.1);
    expect(b.x).toBeCloseTo(1 * CELL + ROLL_DISTANCE, 5);
  });
});

describe('the look', () => {
  it('turns once and squashes in the middle, back to plain shape at both ends', () => {
    expect(rollPose(0)).toMatchObject({ sx: 1, sy: 1, spin: 0, lift: 0 });
    const end = rollPose(ROLL_TIME);
    expect(end.spin).toBeCloseTo(Math.PI * 2, 6);
    expect(end.sy).toBeCloseTo(1, 6);
    expect(rollPose(ROLL_TIME / 2).sy).toBeLessThan(0.8);
  });
});
