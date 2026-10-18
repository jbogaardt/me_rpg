import { describe, expect, it } from 'vitest';
import { SfxSettings } from '../core/soundSettings';
import { GAME_SOUND_NAMES, MAX_VOICES, jitter } from '../systems/gameSounds';
import { GAME_RECIPES, GAME_RECIPES_COMPLETE, GameAudio, MASTER_GAIN, recipePeak } from './gameSfx';
import { RECIPES } from './sfx';
import { voice } from './voice';

interface Osc {
  freqs: number[];
}

/** A fake AudioContext that records what is built (nothing is rendered or heard). */
function fakeContext() {
  const log = {
    oscs: [] as Osc[],
    gainNodes: [] as { gain: { value: number } }[],
    sources: 0,
    buffers: 0,
    compressors: 0,
    resumes: 0,
  };
  let time = 0;
  const param = (osc?: Osc) => ({
    value: 0,
    setValueAtTime(v: number) {
      osc?.freqs.push(v);
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v: number) {
      osc?.freqs.push(v);
    },
    cancelScheduledValues() {},
  });
  const node = <T extends object>(extra: T) => ({ connect: (to: unknown) => to, ...extra });
  const raw = {
    state: 'running',
    sampleRate: 8000,
    destination: {},
    get currentTime() {
      return time;
    },
    resume() {
      log.resumes++;
      return Promise.resolve();
    },
    createGain() {
      const n = node({ gain: param() });
      log.gainNodes.push(n);
      return n;
    },
    createDynamicsCompressor() {
      log.compressors++;
      return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    },
    createBuffer(_c: number, length: number) {
      log.buffers++;
      return { getChannelData: () => new Float32Array(length) };
    },
    createBiquadFilter() {
      return node({ frequency: param(), Q: param(), type: '' });
    },
    createBufferSource() {
      log.sources++;
      return node({ start() {}, stop() {}, buffer: null });
    },
    createOscillator() {
      const osc: Osc = { freqs: [] };
      log.oscs.push(osc);
      return node({ frequency: param(osc), type: 'sine', start() {}, stop() {} });
    },
  };
  return { ctx: raw as unknown as AudioContext, raw, log, advance: (s: number) => (time += s) };
}

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('whiff versus hit', () => {
  it('a swing is airy (soft rise, high noise, no tone) and a hit is a thud (instant, low tone)', () => {
    const { swing, hit } = GAME_RECIPES;
    expect(swing.tones).toBeUndefined();
    expect(swing.attack ?? 0).toBeGreaterThanOrEqual(0.05);
    expect(hit.attack ?? 0).toBeLessThan(0.02);
    expect(swing.noise?.filter).toBe('bandpass');
    expect(Math.min(swing.noise?.from ?? 0, swing.noise?.to ?? 0)).toBeGreaterThanOrEqual(1000);
    expect(Math.max(...(hit.tones ?? []).map((t) => t.from))).toBeLessThan(300);
  });
});

describe('game sound recipes', () => {
  it('has a recipe for every game sound', () => {
    expect(GAME_RECIPES_COMPLETE).toBe(true);
    expect(Object.keys(GAME_RECIPES).sort()).toEqual([...GAME_SOUND_NAMES].sort());
  });
  it('are short, sane and leave headroom (no clipping before the master gain)', () => {
    for (const [name, r] of Object.entries(GAME_RECIPES)) {
      expect(r.dur, name).toBeGreaterThanOrEqual(0.06);
      expect(r.dur, name).toBeLessThanOrEqual(0.25);
      expect(r.pitch, name).toBeGreaterThanOrEqual(0.05);
      expect(r.pitch, name).toBeLessThanOrEqual(0.1);
      expect(recipePeak(r), name).toBeLessThanOrEqual(1);
      expect(recipePeak(r) * 1.1 * MASTER_GAIN, name).toBeLessThanOrEqual(1);
      for (const t of r.tones ?? []) {
        expect(t.from).toBeGreaterThan(30);
        expect(t.to).toBeGreaterThan(30);
        expect(t.from).toBeLessThan(12000);
        expect(t.to).toBeLessThan(12000);
      }
      if (r.noise) {
        expect(r.noise.from).toBeGreaterThan(40);
        expect(r.noise.to).toBeGreaterThan(40);
      }
    }
  });
  it('are not the DM cue recipes', () => {
    expect(Object.keys(RECIPES)).not.toContain('swing');
  });
});

describe('GameAudio', () => {
  it('builds one master chain and one noise buffer however many sounds play', () => {
    const f = fakeContext();
    const audio = new GameAudio(
      () => f.ctx,
      new SfxSettings(memory()),
      () => 0.5,
    );
    for (let i = 0; i < 4; i++) {
      audio.play('swing');
      f.advance(0.1);
    }
    expect(f.log.buffers).toBe(1);
    expect(f.log.compressors).toBe(1);
    expect(f.log.sources).toBe(4);
  });
  it('jitters the pitch inside the bounds', () => {
    const firstFreq = (r: number) => {
      const f = fakeContext();
      new GameAudio(
        () => f.ctx,
        new SfxSettings(memory()),
        () => r,
      ).play('hit');
      return f.log.oscs[0]!.freqs[0]!;
    };
    const base = GAME_RECIPES.hit.tones![0]!.from;
    const amount = GAME_RECIPES.hit.pitch;
    expect(firstFreq(0)).toBeCloseTo(base * (1 - amount), 5);
    expect(firstFreq(0.999999)).toBeCloseTo(base * (1 + amount), 1);
    expect(firstFreq(0.5)).toBeCloseTo(base, 5);
    expect(jitter(0.5, amount)).toBe(1);
  });
  it('never has more than the voice cap sounding', () => {
    const f = fakeContext();
    const audio = new GameAudio(() => f.ctx, new SfxSettings(memory()), Math.random);
    const names = ['swing', 'hit', 'hurt', 'death', 'bolt', 'chest', 'cast', 'clack'] as const;
    for (let i = 0; i < 60; i++) {
      audio.play(names[i % names.length]!);
      expect(audio.voices).toBeLessThanOrEqual(MAX_VOICES);
      f.advance(0.01);
    }
    expect(audio.voices).toBe(MAX_VOICES);
  });
  it('does not rattle the same sound', () => {
    const f = fakeContext();
    const audio = new GameAudio(() => f.ctx, new SfxSettings(memory()));
    audio.play('hit');
    audio.play('hit');
    expect(f.log.sources).toBe(1);
  });
  it('waits for the browser to allow sound, and stays silent without audio', () => {
    const f = fakeContext();
    f.raw.state = 'suspended';
    new GameAudio(() => f.ctx, new SfxSettings(memory())).play('hit');
    expect(f.log.resumes).toBe(1);
    expect(f.log.sources).toBe(0);
    expect(() => new GameAudio(() => null, new SfxSettings(memory())).play('hit')).not.toThrow();
    const broken = () => {
      throw new Error('no audio');
    };
    expect(() => new GameAudio(broken, new SfxSettings(memory())).play('hit')).not.toThrow();
  });
  it('has its own mute, independent of the DM voice mute', () => {
    const f = fakeContext();
    const settings = new SfxSettings(memory());
    const audio = new GameAudio(() => f.ctx, settings);
    const before = voice.muted;
    settings.setMuted(true);
    audio.play('hit');
    expect(f.log.sources).toBe(0);
    expect(voice.muted).toBe(before); // muting the effects leaves the voice alone
    settings.setMuted(false);
    audio.play('hit');
    expect(f.log.sources).toBe(1);
    voice.setMuted(true); // the DM's mute does not reach the game's sounds
    f.advance(1);
    audio.play('swing');
    expect(f.log.sources).toBe(2);
    expect(settings.muted).toBe(false);
    voice.setMuted(before);
  });
  it('scales the master gain by the volume setting', () => {
    const f = fakeContext();
    const settings = new SfxSettings(memory());
    settings.setVolume(0.5);
    new GameAudio(() => f.ctx, settings).play('hit');
    expect(f.log.gainNodes[0]!.gain.value).toBeCloseTo(MASTER_GAIN * 0.5, 5);
  });
});
