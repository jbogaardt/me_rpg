import { describe, expect, it } from 'vitest';
import { fallbackNote, pickVoice, usesNaturalNow, wantsNaturalVoice } from './voiceChoice';

describe('voice choice', () => {
  it('is the browser voice unless the natural one was chosen', () => {
    expect(wantsNaturalVoice(null, true)).toBe(false);
    expect(wantsNaturalVoice('0', true)).toBe(false);
    expect(wantsNaturalVoice('1', true)).toBe(true);
  });
  it('is off where the browser cannot run it', () => {
    expect(wantsNaturalVoice('1', false)).toBe(false);
  });
  it('says why the natural voice failed when it is known', () => {
    expect(fallbackNote(true, true, 'failed', 'Failed to fetch')).toMatch(/\(Failed to fetch\)/);
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

describe('pickVoice', () => {
  const v = (name: string, lang = 'en-US') => ({ name, lang });
  it('prefers a neural voice, then a British man, and never a novelty voice', () => {
    const all = [
      v('Samantha'),
      v('Daniel', 'en-GB'),
      v('Zarvox'),
      v('Microsoft Guy Online (Natural)'),
      v('Amelie', 'fr-FR'),
    ];
    expect(pickVoice(all)?.name).toBe('Microsoft Guy Online (Natural)');
    expect(pickVoice(all.filter((x) => !/Natural/.test(x.name)))?.name).toBe('Daniel');
    expect(pickVoice([v('Zarvox'), v('Amelie', 'fr-FR')])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});
