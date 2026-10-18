import { describe, expect, it } from 'vitest';
import { keyMeaning, loadContextKey, saveContextKey } from './contextKey';

const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

const places = {
  open: { foe: false, thing: false },
  foe: { foe: true, thing: false },
  chest: { foe: false, thing: true },
  both: { foe: true, thing: true },
};

describe('what each key does', () => {
  it('split: attack always swings, interact always uses, wherever you stand', () => {
    for (const near of Object.values(places)) {
      expect(keyMeaning(false, 'attack', near)).toBe('swing');
      expect(keyMeaning(false, 'interact', near)).toBe('use');
    }
  });

  it('split: neither a foe beside a chest nor a chest alone swallows the swing', () => {
    expect(keyMeaning(false, 'attack', places.both)).toBe('swing');
    expect(keyMeaning(false, 'attack', places.chest)).toBe('swing');
  });

  it('contextual: a foe near makes it a sword even beside a chest; a thing alone is used; open ground swings', () => {
    expect(keyMeaning(true, 'attack', places.both)).toBe('swing');
    expect(keyMeaning(true, 'attack', places.foe)).toBe('swing');
    expect(keyMeaning(true, 'attack', places.chest)).toBe('use');
    expect(keyMeaning(true, 'attack', places.open)).toBe('swing');
  });
});

describe('the contextual key setting', () => {
  it('is off (split) by default and remembers being switched on', () => {
    const s = store();
    expect(loadContextKey(s)).toBe(false);
    saveContextKey(true, s);
    expect(loadContextKey(s)).toBe(true);
    saveContextKey(false, s);
    expect(loadContextKey(s)).toBe(false);
  });

  it('survives blocked storage, staying split', () => {
    expect(loadContextKey(undefined)).toBe(false);
    expect(() => saveContextKey(true, undefined)).not.toThrow();
  });
});
