import { describe, expect, it } from 'vitest';
import { Emitter, mulberry32, sampleColor, sampleCurve, TAU, type EmitterDef, type ParticleVisual } from './particles';

const base: EmitterDef = { shape: 'dot', life: 1, size: 4 };
const visual = (): ParticleVisual => ({ x: 0, y: 0, rotation: 0, size: 0, alpha: 0, color: 0 });
const seeded = (def: EmitterDef, x = 0, y = 0, dir = 0) => new Emitter(def, x, y, dir, mulberry32(7));

describe('sampleCurve', () => {
  it('returns constants and interpolates keyframes evenly', () => {
    expect(sampleCurve(0.5, 0.9)).toBe(0.5);
    expect(sampleCurve([0, 1], 0.25)).toBeCloseTo(0.25);
    expect(sampleCurve([0, 1, 0], 0.25)).toBeCloseTo(0.5);
    expect(sampleCurve([0, 1, 0], 0.75)).toBeCloseTo(0.5);
  });

  it('clamps t to [0, 1]', () => {
    expect(sampleCurve([2, 4], -1)).toBe(2);
    expect(sampleCurve([2, 4], 5)).toBe(4);
  });
});

describe('sampleColor', () => {
  it('interpolates per channel', () => {
    expect(sampleColor(0x123456, 0.5)).toBe(0x123456);
    expect(sampleColor([0x000000, 0xff8040], 0.5)).toBe(0x804020);
    expect(sampleColor([0xff0000, 0x00ff00, 0x0000ff], 1)).toBe(0x0000ff);
  });
});

describe('Emitter', () => {
  it('spawns its burst immediately, at the origin', () => {
    const e = seeded({ ...base, burst: 5 }, 10, 20);
    expect(e.count).toBe(5);
    const v = e.visual(0, visual());
    expect([v.x, v.y]).toEqual([10, 20]);
  });

  it('is reproducible with a seeded rng', () => {
    const def: EmitterDef = { ...base, burst: [3, 6], speed: [10, 50], life: [0.5, 1] };
    const run = () => {
      const e = seeded(def);
      e.update(0.1);
      return Array.from({ length: e.count }, (_, i) => ({ ...e.visual(i, visual()) }));
    };
    expect(run()).toEqual(run());
  });

  it('moves particles along dir + angle at speed', () => {
    const e = seeded({ ...base, burst: 1, speed: 100, angle: 0 }, 0, 0, Math.PI / 2); // launched down
    e.update(0.5);
    const v = e.visual(0, visual());
    expect(v.x).toBeCloseTo(0, 3);
    expect(v.y).toBeCloseTo(50, 3);
  });

  it('applies gravity and drag', () => {
    const fall = seeded({ ...base, burst: 1, gravity: 100 });
    fall.update(0.5);
    expect(fall.visual(0, visual()).y).toBeGreaterThan(0);
    const slow = seeded({ ...base, burst: 1, speed: 100, angle: 0, drag: 10 });
    slow.update(0.5);
    expect(slow.visual(0, visual()).x).toBeLessThan(50);
  });

  it('removes particles at the end of their life', () => {
    const e = seeded({ ...base, burst: 4, life: 0.5 });
    e.update(0.4);
    expect(e.count).toBe(4);
    e.update(0.2);
    expect(e.count).toBe(0);
    expect(e.done).toBe(true);
  });

  it('keeps the survivors intact when swap-removing', () => {
    const e = seeded({ ...base, rate: 100, life: [0.1, 1], speed: 20 });
    for (let i = 0; i < 30; i++) e.update(1 / 60);
    const before = e.count;
    expect(before).toBeGreaterThan(5);
    for (let i = 0; i < e.count; i++) {
      const v = e.visual(i, visual());
      expect(Number.isFinite(v.x + v.y + v.size)).toBe(true);
    }
  });

  it('emits at `rate` for `duration`, then finishes once the particles die', () => {
    const e = seeded({ ...base, rate: 60, duration: 0.5, life: 0.2 });
    for (let t = 0; t < 2 && !e.done; t += 1 / 60) e.update(1 / 60);
    expect(e.done).toBe(true);
    expect(e.count).toBe(0);
  });

  it('spawns roughly rate * time particles', () => {
    const e = seeded({ ...base, rate: 100, life: 100, max: 512 });
    for (let i = 0; i < 60; i++) e.update(1 / 60);
    expect(e.count).toBeGreaterThanOrEqual(99);
    expect(e.count).toBeLessThanOrEqual(101);
  });

  it('keeps emitting until stop() when there is no duration', () => {
    const e = seeded({ ...base, rate: 50, life: 0.1 });
    for (let i = 0; i < 120; i++) e.update(1 / 60);
    expect(e.done).toBe(false);
    e.stop();
    for (let i = 0; i < 10; i++) e.update(1 / 60);
    expect(e.done).toBe(true);
  });

  it('drops spawns beyond its capacity instead of growing', () => {
    const e = seeded({ ...base, burst: 50, max: 8 });
    expect(e.capacity).toBe(8);
    expect(e.count).toBe(8);
  });

  it('follows the origin when it moves', () => {
    const e = seeded({ ...base, rate: 60, life: 1 });
    e.x = 100;
    e.update(0.1);
    for (let i = 0; i < e.count; i++) expect(e.visual(i, visual()).x).toBeCloseTo(100, 3);
  });

  it('shapes size, alpha and colour over life', () => {
    const e = seeded({
      ...base,
      burst: 1,
      life: 1,
      size: 10,
      sizeOverLife: [1, 0],
      alphaOverLife: [1, 0],
      colorOverLife: [0xffffff, 0x000000],
    });
    e.update(0.5);
    const v = e.visual(0, visual());
    expect(v.size).toBeCloseTo(5, 1);
    expect(v.alpha).toBeCloseTo(0.5, 1);
    expect(v.color).toBe(0x808080);
  });

  it('aligns to velocity when asked', () => {
    const e = seeded({ ...base, burst: 1, speed: 50, angle: 0, align: true }, 0, 0, Math.PI / 2);
    e.update(0.1);
    expect(e.visual(0, visual()).rotation).toBeCloseTo(Math.PI / 2, 3);
  });

  it('spreads the default launch angle over a full circle', () => {
    const e = seeded({ ...base, burst: 200, speed: 10 });
    e.update(0.1);
    const angles = Array.from({ length: e.count }, (_, i) => {
      const v = e.visual(i, visual());
      return (Math.atan2(v.y, v.x) + TAU) % TAU;
    });
    expect(Math.min(...angles)).toBeLessThan(0.5);
    expect(Math.max(...angles)).toBeGreaterThan(TAU - 0.5);
  });
});
