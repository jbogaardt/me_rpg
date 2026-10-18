import { describe, expect, it } from 'vitest';
import { BAYER4, bayerAt, carriedFlicker, DARK_LEVELS, ditherLevel, poolProfile } from './darkLook';

describe('the dither table', () => {
  it('is a permutation of 0..15, so every step is reached equally often', () => {
    expect([...BAYER4].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
  it('gives thresholds strictly inside 0..1 and repeats every four pixels', () => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const t = bayerAt(x, y);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThan(1);
        expect(t).toBe(bayerAt(x + 4, y + 4));
      }
  });
});

describe('ditherLevel', () => {
  const area = (t: number) => {
    let sum = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sum += ditherLevel(t, DARK_LEVELS, x, y);
    return sum / 16;
  };
  it('is flat at the ends: fully lit is 0, fully dark is the last step', () => {
    expect(area(0)).toBe(0);
    expect(area(1)).toBe(DARK_LEVELS);
  });
  it('averages to the smooth value over a 4x4 block, in whole steps only', () => {
    for (const t of [0.1, 0.25, 0.4, 0.5, 0.77, 0.9]) {
      expect(area(t)).toBeCloseTo(t * DARK_LEVELS, 1);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) expect(Number.isInteger(ditherLevel(t, DARK_LEVELS, x, y))).toBe(true);
    }
  });
  it('only ever picks the two steps either side of the value, so the edge is a stipple and never a band jump', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) seen.add(ditherLevel(0.6, DARK_LEVELS, x, y));
    expect([...seen].sort()).toEqual([2, 3]);
  });
  it('never decreases as the ground gets darker', () => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        let last = 0;
        for (let t = 0; t <= 1; t += 0.02) {
          const l = ditherLevel(t, DARK_LEVELS, x, y);
          expect(l).toBeGreaterThanOrEqual(last);
          last = l;
        }
      }
  });
});

describe('carriedFlicker', () => {
  it('stays within a few percent of steady and differs between two heroes', () => {
    for (let t = 0; t < 30; t += 0.05) expect(Math.abs(carriedFlicker(t, 0) - 1)).toBeLessThan(0.07);
    let apart = 0;
    for (let t = 0; t < 10; t += 0.1) apart = Math.max(apart, Math.abs(carriedFlicker(t, 0) - carriedFlicker(t, 1)));
    expect(apart).toBeGreaterThan(0.02);
  });
});

describe('poolProfile', () => {
  it('is clear at the middle, flat over the core, dark at the rim and never rises', () => {
    const p = poolProfile(33, 0.3);
    expect(p[0]).toBe(1);
    expect(p[p.length - 1]).toBe(0);
    expect(p[Math.floor(33 * 0.25)]).toBe(1);
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeLessThanOrEqual(p[i - 1]!);
  });
});
