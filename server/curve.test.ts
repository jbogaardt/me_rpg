import { describe, expect, it } from 'vitest';
import { Curve, curveText } from './curve';

describe('the engagement curve', () => {
  it('averages the table reads of each block and keeps the worst pressure', () => {
    const c = new Curve();
    c.add(10, { pressure: 0.2, stalled: 0 });
    c.add(100, { pressure: 0.8, stalled: 0.5 });
    c.add(400, { pressure: 0.1, stalled: 1 });
    const blocks = c.blocks(300);
    expect([...blocks.keys()]).toEqual([0, 1]);
    expect(blocks.get(0)).toMatchObject({ pressureAvg: 0.5, pressureMax: 0.8, stalledAvg: 0.25, reads: 2 });
    expect(curveText(blocks.get(0)!)).toBe('table read: pressure avg 50% max 80%, stalled avg 25%');
  });

  it('is empty without reads (no key)', () => {
    expect(new Curve().blocks(300).size).toBe(0);
  });
});
