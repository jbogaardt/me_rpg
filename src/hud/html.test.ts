import { describe, expect, it } from 'vitest';
import { esc } from './html';

describe('esc', () => {
  it('turns markup in content into plain text, in a tag or an attribute', () => {
    expect(esc('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(esc("Maren's & Orin's")).toBe('Maren&#39;s &amp; Orin&#39;s');
    expect(esc(42)).toBe('42');
    // Nothing that could open or close a tag or an attribute survives.
    expect(esc('"><script>alert(1)</script>')).not.toMatch(/[<>"]/);
  });
});
