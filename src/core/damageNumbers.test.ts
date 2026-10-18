import { describe, expect, it } from 'vitest';
import { loadDamageNumbers, saveDamageNumbers } from './damageNumbers';

const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('the damage numbers setting', () => {
  it('is off by default and remembers being switched on', () => {
    const s = store();
    expect(loadDamageNumbers(s)).toBe(false);
    saveDamageNumbers(true, s);
    expect(loadDamageNumbers(s)).toBe(true);
    saveDamageNumbers(false, s);
    expect(loadDamageNumbers(s)).toBe(false);
  });

  it('survives blocked storage, staying off', () => {
    expect(loadDamageNumbers(undefined)).toBe(false);
    expect(() => saveDamageNumbers(true, undefined)).not.toThrow();
  });
});
