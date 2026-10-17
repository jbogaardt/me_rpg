import { describe, expect, it } from 'vitest';
import { HARD_SNAP, Reconciler } from './prediction';

describe('Reconciler', () => {
  it('does nothing when the host agrees or the input is unknown', () => {
    const r = new Reconciler();
    r.record(1, 100, 100, 0);
    expect(r.reconcile(1, 100, 101, 50)).toBeNull();
    expect(r.step(0.016)).toEqual({ x: 0, y: 0 });
    expect(r.reconcile(9, 500, 500, 60)).toBeNull();
    expect(r.rtt).toBe(50);
  });

  it('eases a small error in over several frames and sums to the error', () => {
    const r = new Reconciler();
    r.record(1, 100, 100, 0);
    expect(r.reconcile(1, 110, 100, 40)).toBeNull();
    expect(r.lastError).toBe(10);
    const first = r.step(1 / 60).x;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(10);
    let total = first;
    for (let i = 0; i < 120; i++) total += r.step(1 / 60).x;
    expect(total).toBeCloseTo(10, 3);
  });

  it('does not count an error twice: the history moves with a correction', () => {
    const r = new Reconciler();
    r.record(1, 100, 100, 0);
    r.record(2, 110, 100, 33);
    r.reconcile(1, 106, 100, 60); // 6 px off, history shifts by 6
    r.reconcile(2, 116, 100, 90); // the host agrees with the shifted history
    expect(r.lastError).toBe(0);
    let total = 0;
    for (let i = 0; i < 200; i++) total += r.step(1 / 60).x;
    expect(total).toBeCloseTo(6, 3);
  });

  it('is frame-rate independent', () => {
    const sum = (dt: number, frames: number) => {
      const r = new Reconciler();
      r.record(1, 0, 0, 0);
      r.reconcile(1, 20, 0, 1);
      let x = 0;
      for (let i = 0; i < frames; i++) x += r.step(dt).x;
      return x;
    };
    expect(sum(1 / 30, 15)).toBeCloseTo(sum(1 / 120, 60), 3);
  });

  it('jumps at once above the hard threshold and forgets the history', () => {
    const r = new Reconciler();
    r.record(1, 0, 0, 0);
    expect(r.reconcile(1, HARD_SNAP + 5, 0, 10)).toEqual({ x: HARD_SNAP + 5, y: 0 });
    expect(r.step(0.1)).toEqual({ x: 0, y: 0 });
    expect(r.reconcile(1, 0, 0, 20)).toBeNull(); // history gone
  });
});
