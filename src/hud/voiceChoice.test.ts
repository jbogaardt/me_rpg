import { describe, expect, it } from 'vitest';
import { fallbackNote, usesNaturalNow, wantsNaturalVoice } from './voiceChoice';

describe('voice choice', () => {
  it('defaults to the natural voice with nothing stored', () => {
    expect(wantsNaturalVoice(null, true)).toBe(true);
    expect(wantsNaturalVoice('1', true)).toBe(true);
  });
  it('keeps an explicit choice of the browser voice', () => {
    expect(wantsNaturalVoice('0', true)).toBe(false);
  });
  it('is off where the browser cannot run it', () => {
    expect(wantsNaturalVoice(null, false)).toBe(false);
  });
  it('speaks natural only when ready, the browser voice otherwise', () => {
    expect(usesNaturalNow(true, 'ready')).toBe(true);
    for (const s of ['idle', 'loading', 'failed'] as const) expect(usesNaturalNow(true, s)).toBe(false);
    expect(usesNaturalNow(false, 'ready')).toBe(false);
  });
  it('notes a fallback only when one happened', () => {
    expect(fallbackNote(true, true, 'failed')).toMatch(/could not be loaded/);
    expect(fallbackNote(true, false, 'idle')).toMatch(/cannot run/);
    expect(fallbackNote(true, true, 'loading')).toBeNull();
    expect(fallbackNote(false, true, 'failed')).toBeNull();
  });
});
