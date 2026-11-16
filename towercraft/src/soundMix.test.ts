import { describe, expect, it } from 'vitest';
import {
  NEAR,
  PAN_MAX,
  REF_HALF_W,
  SILENT,
  cutoffOf,
  fightLevel,
  budget,
  loudest,
  rankOf,
  TICK_BUDGET,
  mixAt,
  zoomGain,
  type View,
} from './soundMix';

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

describe('zoom and the music', () => {
  it('is a little quieter zoomed far out, never louder than tuned, never silent', () => {
    expect(zoomGain({ ...view, halfW: REF_HALF_W })).toBe(1);
    expect(zoomGain({ ...view, halfW: 4 })).toBe(1);
    const far = zoomGain({ ...view, halfW: 60 });
    expect(far).toBeLessThan(0.8);
    expect(far).toBeGreaterThanOrEqual(0.55);
    expect(zoomGain({ ...view, halfW: 1e6 })).toBe(0.55);
  });

  it('opens the music with fighting or a hurt castle and settles back slowly', () => {
    expect(fightLevel(0, 0, false)).toBe(0);
    expect(fightLevel(0, 3, false)).toBeCloseTo(0.6);
    expect(fightLevel(0, 50, false)).toBe(1);
    expect(fightLevel(0, 0, true)).toBe(1);
    const calmer = fightLevel(1, 0, false);
    expect(calmer).toBeLessThan(1);
    expect(calmer).toBeGreaterThan(0.95);
    expect(cutoffOf(0)).toBeLessThan(cutoffOf(1));
    expect(cutoffOf(5)).toBe(cutoffOf(1));
  });
});

describe('the tick budget', () => {
  it('keeps everything in a small tick and the most important of a crowd, big events first', () => {
    const small = [{ k: 1 }, { k: 2 }];
    expect(budget(small, TICK_BUDGET, () => 1)).toBe(small);
    const crowd = Array.from({ length: 30 }, (_, i) => ({ prio: i === 17 ? 9 : 1, gain: 0.5, i }));
    const kept = budget(crowd, TICK_BUDGET, (s) => rankOf(s.prio, s.gain));
    expect(kept).toHaveLength(TICK_BUDGET);
    expect(kept[0]!.i).toBe(17);
    expect(kept.slice(1).map((s) => s.i)).toEqual([0, 1, 2, 3, 4, 5, 6]); // ties keep their order
  });

  it('ranks a louder sound of the same priority higher', () => {
    expect(rankOf(2, 0.9)).toBeGreaterThan(rankOf(2, 0.4));
    expect(rankOf(5, 0.1)).toBeGreaterThan(rankOf(2, 1));
  });
});
