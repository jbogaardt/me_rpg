import { describe, expect, it } from 'vitest';
import { duckOf, peakOf, playRecipe, RECIPES, type SynthKind } from './synth';

const kinds = Object.keys(RECIPES) as SynthKind[];

describe('the synthesized cues', () => {
  it('stay quiet: no partial above 0.3, the loudest being the refusal thud', () => {
    for (const k of kinds) expect(peakOf(RECIPES[k]), k).toBeLessThanOrEqual(0.3);
    expect(peakOf(RECIPES.coin)).toBeLessThan(0.05);
    expect(peakOf(RECIPES.click)).toBeLessThan(peakOf(RECIPES.alarm));
  });

  it('duck the music only for the alarm and the stingers', () => {
    expect(kinds.filter((k) => duckOf(k)).sort()).toEqual(['alarm', 'lose', 'win']);
  });

  it('are made of audible, finite notes', () => {
    for (const k of kinds) for (const n of RECIPES[k].notes) expect(n.f0 > 50 && n.dur > 0 && n.peak > 0, k).toBe(true);
  });

  it('build a node graph without throwing, and say when they end', () => {
    const made: string[] = [];
    const param = () => ({
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      value: 0,
    });
    const node = (type: string) => {
      made.push(type);
      const o: Record<string, unknown> = {
        connect: (x: unknown) => x,
        start() {},
        stop() {},
        gain: param(),
        frequency: param(),
      };
      return o;
    };
    const ctx = {
      currentTime: 1,
      sampleRate: 8000,
      createGain: () => node('gain'),
      createOscillator: () => node('osc'),
      createBiquadFilter: () => node('filter'),
      createBufferSource: () => node('src'),
      createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    } as unknown as AudioContext;
    for (const k of kinds) {
      made.length = 0;
      const { nodes, ends } = playRecipe(ctx, { connect() {} } as unknown as AudioNode, RECIPES[k]);
      expect(nodes, k).toBeGreaterThan(0);
      expect(made.length, k).toBeGreaterThan(0);
      expect(ends, k).toBeGreaterThan(0);
    }
  });
});
