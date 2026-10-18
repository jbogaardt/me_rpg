import { describe, expect, it } from 'vitest';
import { PARTICLE_EFFECTS } from './particleEffects';
import { Emitter, MAX_CAPACITY, mulberry32, type EffectDef, type EmitterDef, type Range } from './particles';

const defs = Object.entries(PARTICLE_EFFECTS) as [string, EffectDef][];
const emitters = defs.flatMap(([name, def]) =>
  def.emitters.map((e, i) => [`${name}[${i}]`, e] as [string, EmitterDef]),
);
const bounds = (r: Range): [number, number] => (typeof r === 'number' ? [r, r] : [Math.min(...r), Math.max(...r)]);
const curveValues = (c: number | readonly number[] | undefined) => (c === undefined ? [] : [c].flat());

describe('PARTICLE_EFFECTS', () => {
  it.each(defs)('%s has at least one emitter', (_name, def) => {
    expect(def.emitters.length).toBeGreaterThan(0);
  });

  it.each(emitters)('%s emits something with a positive life and size', (_name, e) => {
    expect(e.burst !== undefined || (e.rate ?? 0) > 0).toBe(true);
    expect(bounds(e.life)[0]).toBeGreaterThan(0);
    expect(bounds(e.size)[0]).toBeGreaterThan(0);
    if (e.rate !== undefined) expect(e.rate).toBeGreaterThan(0);
  });

  it.each(emitters)('%s keeps its curves in range', (_name, e) => {
    for (const v of curveValues(e.alphaOverLife)) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of curveValues(e.alphaOverLife)) expect(v).toBeLessThanOrEqual(1);
    for (const v of curveValues(e.sizeOverLife)) expect(v).toBeGreaterThanOrEqual(0);
    for (const c of curveValues(e.colorOverLife)) expect(c).toBeLessThanOrEqual(0xffffff);
  });

  it.each(emitters)('%s fits its pool without hitting the global cap', (_name, e) => {
    expect(new Emitter(e).capacity).toBeLessThan(MAX_CAPACITY);
  });

  it.each(emitters)('%s finishes (or runs until stopped) and then empties', (_name, e) => {
    const em = new Emitter(e, 0, 0, 0, mulberry32(1));
    const continuous = (e.rate ?? 0) > 0 && e.duration === undefined;
    if (continuous) {
      for (let i = 0; i < 60; i++) em.update(1 / 60);
      expect(em.done).toBe(false);
      em.stop();
    }
    for (let i = 0; i < 60 * 5 && !em.done; i++) em.update(1 / 60);
    expect(em.done).toBe(true);
  });
});

describe('hitSpark', () => {
  const streak = PARTICLE_EFFECTS.hitSpark.emitters.find((e) => e.shape === 'streak') as EmitterDef;

  it('sprays 6-10 streaks for 150-250 ms', () => {
    const [lo, hi] = bounds(streak.burst ?? 0);
    expect(lo).toBeGreaterThanOrEqual(6);
    expect(hi).toBeLessThanOrEqual(10);
    const [l0, l1] = bounds(streak.life);
    expect(l0).toBeGreaterThanOrEqual(0.15);
    expect(l1).toBeLessThanOrEqual(0.25);
  });

  it('is a cone along the blow, every spark flung away from the hit', () => {
    const [a0, a1] = bounds(streak.angle ?? [-Math.PI, Math.PI]);
    expect(a0).toBeGreaterThanOrEqual(-Math.PI / 2);
    expect(a1).toBeLessThanOrEqual(Math.PI / 2);
    expect(streak.align).toBe(true);
  });

  it('one draw call per emitter, no more than two emitters', () => {
    expect(PARTICLE_EFFECTS.hitSpark.emitters.length).toBeLessThanOrEqual(2);
  });
});
