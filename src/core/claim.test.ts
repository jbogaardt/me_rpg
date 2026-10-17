import { describe, expect, it } from 'vitest';
import { CLAIM_BURST, PositionClaim } from './claim';

const at = { x: 100, y: 100 };

describe('PositionClaim', () => {
  it('adopts a claim a hero could have walked to, once, then holds', () => {
    const c = new PositionClaim();
    expect(c.judge(1, 104, 100, at, true)).toBe('adopt');
    expect(c.judge(1, 104, 100, at, true)).toBe('hold'); // the same input again: nothing more to do
    expect(c.judge(2, 108, 100, { x: 104, y: 100 }, true)).toBe('adopt');
  });

  it('refuses a spot the host calls blocked, and a jump no hero could make', () => {
    const c = new PositionClaim();
    expect(c.judge(1, 104, 100, at, false)).toBe('reject');
    expect(c.judge(1, 104, 100, at, true)).toBe('reject'); // a refused claim stays refused: the host walks the hero
    expect(c.judge(2, 100 + CLAIM_BURST * 3, 100, at, true)).toBe('reject');
  });

  it('spends allowance on what is walked and earns it back with time', () => {
    const c = new PositionClaim();
    let n = 0;
    let x = 100;
    // walk in 20 px strides with no time passing: the burst runs out
    const verdicts = Array.from({ length: 6 }, () => {
      const v = c.judge(++n, x + 20, 100, { x, y: 100 }, true);
      if (v === 'adopt') x += 20;
      return v;
    });
    expect(verdicts).toContain('reject');
    c.tick(1, 120); // a second of walking passes
    expect(c.judge(++n, x + 20, 100, { x, y: 100 }, true)).toBe('adopt');
  });

  it('starts over after a reset', () => {
    const c = new PositionClaim();
    c.judge(1, 100 + CLAIM_BURST, 100, at, true);
    c.reset();
    expect(c.judge(1, 104, 100, at, true)).toBe('adopt');
  });
});
