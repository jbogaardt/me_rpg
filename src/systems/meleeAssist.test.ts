import { describe, expect, it } from 'vitest';
import { assistFacing, type Foe } from './meleeAssist';

const foe = (x: number, y: number, allowance = 0): Foe => ({ x, y, allowance });
const REACH = 22;

describe('assistFacing', () => {
  it('keeps the facing when the swing already hits', () => {
    expect(assistFacing(0, 0, 'right', [foe(16, 0)], REACH)).toBe('right');
  });
  it('keeps the facing when a hit foe exists even if another is nearer', () => {
    expect(assistFacing(0, 0, 'right', [foe(0, 8), foe(30, 0)], REACH)).toBe('right');
  });
  it('turns toward a near foe the facing would miss', () => {
    expect(assistFacing(0, 0, 'left', [foe(24, 6)], REACH)).toBe('right');
    expect(assistFacing(0, 0, 'right', [foe(2, -30)], REACH)).toBe('up');
  });
  it('ignores foes out of range', () => {
    expect(assistFacing(0, 0, 'left', [foe(80, 0)], REACH)).toBe('left');
  });
  it('keeps the facing with no foes', () => {
    expect(assistFacing(0, 0, 'down', [], REACH)).toBe('down');
  });
  it('turns to the nearest of several', () => {
    expect(assistFacing(0, 0, 'left', [foe(0, 38), foe(20, 0)], REACH)).toBe('right');
  });
});
