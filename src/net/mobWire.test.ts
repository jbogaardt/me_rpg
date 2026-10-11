import { describe, expect, it } from 'vitest';
import type { MobView } from '../systems/combat';
import { decodeMob, encodeMob } from './mobWire';

const view = (patch: Partial<MobView> = {}): MobView => ({
  x: 100.4,
  y: 200.6,
  facing: 'left',
  state: 'windup',
  hp: 12,
  timer: 0.35,
  moving: false,
  ...patch,
});

describe('mob wire format', () => {
  it('round-trips a mob, to whole pixels and milliseconds', () => {
    expect(decodeMob(encodeMob(view()))).toEqual(view({ x: 100, y: 201 }));
    expect(decodeMob(encodeMob(view({ state: 'dead', timer: 5.5, moving: true })))).toMatchObject({
      state: 'dead',
      timer: 5.5,
      moving: true,
    });
  });

  it('sends the timer only while it means something', () => {
    for (const state of ['windup', 'recover', 'dead'] as const) expect(encodeMob(view({ state }))[5]).toBe(350);
    for (const state of ['idle', 'wander', 'chase'] as const) expect(encodeMob(view({ state }))[5]).toBe(0);
  });

  it('gives a still mob the same tuple every time, whatever its internal wander timer says', () => {
    const a = encodeMob(view({ state: 'idle', timer: 0.9 }));
    const b = encodeMob(view({ state: 'idle', timer: 0.1 }));
    expect(a).toEqual(b);
  });

  it('survives a bad index by falling back, since the parser already rejects them', () => {
    expect(decodeMob([0, 0, 99, 99, 1, 0, 0])).toMatchObject({ facing: 'down', state: 'idle' });
  });
});
