import { describe, expect, it } from 'vitest';
import { COMBO_WINDOW, ComboReader } from './combo';

const SET = ['uulr', 'uldr', 'ddrr'];

describe('ComboReader', () => {
  it('finishes a combo on its last key', () => {
    const r = new ComboReader();
    expect(r.press('u', SET)).toBe(-1);
    expect(r.press('u', SET)).toBe(-1);
    expect(r.press('l', SET)).toBe(-1);
    expect(r.press('r', SET)).toBe(0);
    expect(r.typed).toBe(''); // starts over once it has fired
  });

  it('tells combos apart', () => {
    const r = new ComboReader();
    const found = [...'ddrr'].map((k) => r.press(k as 'd' | 'r', SET));
    expect(found).toEqual([-1, -1, -1, 2]);
  });

  it('finds a combo that starts in the middle of other taps', () => {
    const r = new ComboReader();
    for (const k of 'lrd') r.press(k as 'l' | 'r' | 'd', SET);
    for (const k of 'uul') expect(r.press(k as 'u' | 'l', SET)).toBe(-1);
    expect(r.press('r', SET)).toBe(0);
  });

  it('forgets what was typed after a pause', () => {
    const r = new ComboReader();
    r.press('u', SET);
    r.press('u', SET);
    r.tick(COMBO_WINDOW + 0.1);
    expect(r.typed).toBe('');
    r.press('l', SET);
    expect(r.press('r', SET)).toBe(-1); // "lr" alone is nothing
  });

  it('keeps going while the taps come within the window', () => {
    const r = new ComboReader();
    for (const k of 'uul') {
      r.press(k as 'u' | 'l', SET);
      r.tick(COMBO_WINDOW - 0.1);
    }
    expect(r.press('r', SET)).toBe(0);
  });

  it('prefers the longest combo when two end together', () => {
    const r = new ComboReader();
    const set = ['lr', 'ulr'];
    r.press('u', set);
    r.press('l', set);
    expect(r.press('r', set)).toBe(1);
  });

  it('does nothing without a wand or tome', () => {
    const r = new ComboReader();
    expect(r.press('u', [])).toBe(-1);
    expect(r.typed).toBe('');
  });
});
