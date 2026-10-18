import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { glintRange, glow, MAX_MARKS, nearestInReach, newThing, pickMarks, type Thing } from './interactThings';

const thing = (dist: number, patch: Partial<Thing> = {}): Thing => ({
  ...newThing(),
  dist,
  reach: CELL * 1.5,
  ...patch,
});

describe('glow', () => {
  const reach = CELL * 1.5;
  it('is full in reach, faint at the edge of the range, nothing beyond, and brightens on approach', () => {
    expect(glow(reach, reach)).toBe(1);
    expect(glow(0, reach)).toBe(1);
    expect(glow(glintRange(reach), reach)).toBe(0);
    const far = glow(reach + CELL * 0.7, reach);
    const near = glow(reach + CELL * 0.2, reach);
    expect(far).toBeGreaterThan(0.25);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThan(1);
  });

  it('starts at two tiles for a short reach', () => {
    expect(glintRange(CELL)).toBe(2 * CELL);
  });
});

describe('pickMarks', () => {
  it('keeps the nearest MAX_MARKS, nearest first, and skips what is out of range or marks itself', () => {
    const things = [
      ...Array.from({ length: 12 }, (_, i) => thing(CELL * 0.2 * (12 - i))), // 12 things, the last the nearest
      thing(CELL * 9), // too far
      thing(1, { mark: false }), // a Harvest button already shows it
    ];
    const out = Array.from({ length: MAX_MARKS }, newThing);
    const n = pickMarks(things, things.length, out);
    expect(n).toBe(MAX_MARKS);
    for (let i = 1; i < n; i++) expect(out[i]!.dist).toBeGreaterThanOrEqual(out[i - 1]!.dist);
    expect(out[0]!.dist).toBeCloseTo(CELL * 0.2);
    expect(out.every((t) => t.mark && t.dist < CELL * 3)).toBe(true);
  });
});

describe('nearestInReach', () => {
  it('names the glyph of the nearest thing the key would act on, else null (the button hides)', () => {
    expect(nearestInReach([thing(CELL * 3, { kind: 'chest' })], 1)).toBeNull();
    const things = [
      thing(CELL, { kind: 'talk' }),
      thing(CELL * 0.5, { kind: 'chest' }),
      thing(CELL * 3, { kind: 'hand' }),
    ];
    expect(nearestInReach(things, 3)).toBe('chest');
    expect(nearestInReach(things, 0)).toBeNull();
  });
});
