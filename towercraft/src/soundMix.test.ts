import { describe, expect, it } from 'vitest';
import { NEAR, PAN_MAX, SILENT, loudest, mixAt, type View } from './soundMix';

const view: View = { cx: 50, cy: 40, halfW: 20, halfH: 10 };

describe('where a sound is heard from', () => {
  it('is full volume and centred in the middle of the screen', () => {
    expect(mixAt(view, 50, 40)).toEqual({ gain: 1, pan: 0 });
  });

  it('stays full volume across the middle of the screen and fades towards its edge', () => {
    expect(mixAt(view, 50 + NEAR * 20, 40).gain).toBe(1);
    const edge = mixAt(view, 70, 40).gain;
    expect(edge).toBeLessThan(1);
    expect(edge).toBeGreaterThan(0.2);
  });

  it('gets quieter the farther off-screen it is, and is silent past the limit', () => {
    const gains = [0, 10, 20, 30, 40].map((d) => mixAt(view, 50 + d, 40).gain);
    for (let i = 1; i < gains.length; i++) expect(gains[i]!).toBeLessThanOrEqual(gains[i - 1]!);
    expect(mixAt(view, 50 + SILENT * 20, 40).gain).toBe(0);
    expect(mixAt(view, 500, 40).gain).toBe(0);
  });

  it('measures against the screen, so the same cells are nearer when zoomed out', () => {
    const wide: View = { ...view, halfW: 40, halfH: 20 };
    expect(mixAt(wide, 80, 40).gain).toBeGreaterThan(mixAt(view, 80, 40).gain);
  });

  it('leans to the side it comes from, never all the way', () => {
    expect(mixAt(view, 40, 40).pan).toBeLessThan(0);
    expect(mixAt(view, 60, 40).pan).toBeGreaterThan(0);
    expect(mixAt(view, 500, 40).pan).toBe(PAN_MAX);
    expect(mixAt(view, -500, 40).pan).toBe(-PAN_MAX);
  });

  it('keeps the loudest of a crowd and every sound of a small one', () => {
    const crowd = [0.2, 0.9, 0.1, 0.5].map((gain) => ({ gain }));
    expect(loudest(crowd, 2).map((s) => s.gain)).toEqual([0.9, 0.5]);
    expect(loudest(crowd, 9)).toBe(crowd);
  });
});
