import { describe, expect, it } from 'vitest';
import { SFX_NAMES } from './cues';
import { PARTICLE_EFFECTS } from './particleEffects';
import { FX_SOUNDS, GAME_SOUND_NAMES, MAX_VOICES, VoiceCap, jitter, soundForFx } from './gameSounds';

describe('event to sound table', () => {
  it('covers the effects the combat flow plays', () => {
    for (const fx of [
      'hitSpark',
      'heroHurt',
      'mobPoof',
      'mobDust',
      'mobSplat',
      'mobWisp',
      'boltImpact',
      'castGlow',
      'levelUp',
      'coinPop',
    ] as const) {
      expect(soundForFx(fx), fx).toBeDefined();
    }
  });
  it('names only real effects and real sounds', () => {
    for (const [fx, sound] of Object.entries(FX_SOUNDS)) {
      expect(fx in PARTICLE_EFFECTS, fx).toBe(true);
      expect(GAME_SOUND_NAMES).toContain(sound);
    }
  });
  it('leaves ambient effects silent', () => {
    expect(soundForFx('smoke')).toBeUndefined();
    expect(soundForFx('drip')).toBeUndefined();
  });
  it('chimes for the level ring, thuds for a refusal, and has no sound for a word', () => {
    expect(soundForFx('levelRing')).toBe('levelUp');
    expect(soundForFx('deny')).toBe('deny');
    expect(soundForFx('hitHeavy')).toBe('hit');
    expect(soundForFx('heroHurtHeavy')).toBe('hurt');
  });
  it('keeps the DM cue vocabulary separate from the game sounds', () => {
    expect(SFX_NAMES as readonly string[]).not.toContain('swing');
    expect(SFX_NAMES as readonly string[]).not.toContain('hit');
  });
});

describe('jitter', () => {
  it('stays inside its bounds', () => {
    for (const amount of [0.05, 0.08, 0.1]) {
      for (let i = 0; i <= 100; i++) {
        const j = jitter(Math.min(0.999999, i / 100), amount);
        expect(j).toBeGreaterThanOrEqual(1 - amount);
        expect(j).toBeLessThanOrEqual(1 + amount);
      }
    }
  });
});

describe('VoiceCap', () => {
  it('never holds more than the cap, dropping the oldest', () => {
    const cap = new VoiceCap();
    const stopped: number[] = [];
    for (let i = 0; i < 40; i++) {
      cap.add('x', { start: i * 0.01, end: 10, stop: () => stopped.push(i) }, i * 0.01);
      expect(cap.count).toBeLessThanOrEqual(MAX_VOICES);
    }
    expect(stopped[0]).toBe(0);
    expect(stopped).toHaveLength(40 - MAX_VOICES);
  });
  it('forgets voices that have ended and rate-limits repeats', () => {
    const cap = new VoiceCap();
    cap.add('hit', { start: 0, end: 0.1, stop: () => {} }, 0);
    expect(cap.tooSoon('hit', 0.01)).toBe(true);
    expect(cap.tooSoon('hit', 0.2)).toBe(false);
    expect(cap.tooSoon('swing', 0.01)).toBe(false);
    cap.add('swing', { start: 0.5, end: 0.6, stop: () => {} }, 0.5);
    expect(cap.count).toBe(1);
  });
});
