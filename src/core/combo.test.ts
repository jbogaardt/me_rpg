import { describe, expect, it } from 'vitest';
import { COMBO_WINDOW, COMBO_WINDOW_TOUCH, ComboReader } from './combo';

const SET = ['urulr', 'ldlrd', 'drudl'];
const type = (r: ComboReader, keys: string, set: readonly string[] = SET) =>
  [...keys].map((k) => r.press(k as 'u' | 'd' | 'l' | 'r', set));

describe('ComboReader', () => {
  it('finishes a combo on its last key', () => {
    const r = new ComboReader();
    expect(type(r, 'urulr')).toEqual([-1, -1, -1, -1, 0]);
    expect(r.typed).toBe(''); // starts over once it has fired
  });

  it('tells combos apart', () => {
    expect(type(new ComboReader(), 'drudl')).toEqual([-1, -1, -1, -1, 2]);
    expect(type(new ComboReader(), 'ldlrd')).toEqual([-1, -1, -1, -1, 1]);
  });

  it('finds a combo that starts in the middle of other taps', () => {
    const r = new ComboReader();
    type(r, 'rdl');
    expect(type(r, 'urulr').at(-1)).toBe(0);
  });

  it('forgets what was typed after a pause, a longer one allowed on the touch pad', () => {
    const r = new ComboReader();
    type(r, 'uru');
    r.tick(COMBO_WINDOW + 0.1);
    expect(r.typed).toBe('');
    const t = new ComboReader();
    type(t, 'uru');
    t.tick(COMBO_WINDOW + 0.1, COMBO_WINDOW_TOUCH);
    expect(t.typed).toBe('uru'); // still within a thumb's pause
    t.tick(COMBO_WINDOW_TOUCH, COMBO_WINDOW_TOUCH);
    expect(t.typed).toBe('');
  });

  it('keeps going while the taps come within the window', () => {
    const r = new ComboReader();
    for (const k of 'urul') {
      r.press(k as 'u' | 'r' | 'l', SET);
      r.tick(COMBO_WINDOW - 0.1);
    }
    expect(r.press('r', SET)).toBe(0);
  });

  it('ignores a tap of the direction just tapped, so a wobbling thumb or a double tap does not break a combo', () => {
    const r = new ComboReader();
    const fired = [...'uurruulllrr'].map((k) => r.press(k as 'u' | 'r' | 'l', SET)); // u r u l r with every tap doubled or more
    expect(fired.filter((i) => i >= 0)).toEqual([0]);
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
