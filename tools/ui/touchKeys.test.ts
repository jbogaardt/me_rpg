import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, FIXED_KEYS, RESERVED_CODES, TOUCH_CODES } from '../../src/core/bindings';

// index.html puts a `data-key` on every button that stands in for a key (A, B, I, M, ☰, ✕, the dialog box). Each one must
// press a code the game really listens for, or the button silently does nothing.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const keys = [...html.matchAll(/data-key="(\w+)"/g)].map((m) => m[1]);

describe('the on-screen buttons', () => {
  it('each press a code some action or fixed key listens to', () => {
    const listened = new Set<string>([...Object.values(TOUCH_CODES).flat(), ...RESERVED_CODES]);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(listened.has(key), key).toBe(true);
  });

  it('the menu and map buttons use the first fixed key of each', () => {
    expect(keys).toContain(FIXED_KEYS.menu[0]);
    expect(keys).toContain(FIXED_KEYS.map[0]);
  });
});

describe('the quick-item button', () => {
  it('reads its own pointer gestures, so it carries no data-key (a held key could not tell a tap from a swipe)', () => {
    expect(html).toMatch(/id="item-btn"/);
    expect(html).not.toMatch(/id="item-btn"[^>]*data-key/);
    expect(keys).not.toContain('Digit1'); // the old column of four slot buttons is gone; the number keys still work
  });

  it('has bindable keys that clash with nothing', () => {
    for (const a of ['itemUse', 'itemPrev', 'itemNext'] as const) {
      expect(TOUCH_CODES[a]).toEqual([]);
      for (const code of DEFAULT_BINDINGS[a]) expect(RESERVED_CODES).not.toContain(code);
    }
    const all = Object.values(DEFAULT_BINDINGS).flat().filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });
});
