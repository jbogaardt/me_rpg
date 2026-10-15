import { describe, expect, it } from 'vitest';
import { CONJURE_GAP_MS, MAX_PEOPLE, MockConjurer, shouldConjure } from './conjure';

const LOOKS = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
];

describe('shouldConjure', () => {
  const arrive = { kind: 'arrive', area: 'Caves' } as const;
  it('brings someone in on arrival, spaced out and capped', () => {
    expect(shouldConjure(arrive, 0, CONJURE_GAP_MS)).toBe(true);
    expect(shouldConjure(arrive, 0, CONJURE_GAP_MS - 1)).toBe(false);
    expect(shouldConjure(arrive, MAX_PEOPLE, CONJURE_GAP_MS)).toBe(false);
    expect(shouldConjure({ kind: 'quiet', area: 'Caves' }, 0, CONJURE_GAP_MS)).toBe(false);
    expect(shouldConjure(null, 0, CONJURE_GAP_MS)).toBe(false);
  });
});

describe('MockConjurer', () => {
  it('makes a different, valid person each time and wears the looks in turn', async () => {
    const c = new MockConjurer();
    const first = await c.person({ area: 'Caves', looks: LOOKS, made: 0 });
    const second = await c.person({ area: 'Caves', looks: LOOKS, made: 1 });
    expect(first?.look).toBe('a');
    expect(second?.look).toBe('b');
    expect(first?.name).not.toBe(second?.name);
    for (const p of [first, second]) {
      expect(p!.name.length).toBeLessThanOrEqual(32);
      expect(p!.lines.length).toBeGreaterThan(0);
      expect(p!.lines.length).toBeLessThanOrEqual(4);
      expect(p!.lines.every((l) => l.length <= 140)).toBe(true);
    }
  });
  it('makes nobody when no look is on offer', async () => {
    expect(await new MockConjurer().person({ area: 'x', looks: [], made: 0 })).toBeNull();
  });
  it('keeps names within the page limit even for repeats', async () => {
    const p = await new MockConjurer().person({ area: 'x', looks: LOOKS, made: 5 });
    expect(p!.name.length).toBeLessThanOrEqual(32);
  });
});
