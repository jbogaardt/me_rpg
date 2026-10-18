import { describe, expect, it } from 'vitest';
import { loadItemPopup, saveItemPopup } from './itemPopup';

const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('the quick-item pop-up setting', () => {
  it('is on by default and remembers being switched off', () => {
    const s = store();
    expect(loadItemPopup(s)).toBe(true);
    saveItemPopup(false, s);
    expect(loadItemPopup(s)).toBe(false);
    saveItemPopup(true, s);
    expect(loadItemPopup(s)).toBe(true);
  });

  it('survives blocked storage', () => {
    expect(loadItemPopup(undefined)).toBe(true);
    expect(() => saveItemPopup(false, undefined)).not.toThrow();
  });
});
