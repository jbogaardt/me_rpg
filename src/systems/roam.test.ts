import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { mulberry32 } from './particles';
import {
  folkFromWire,
  folkWire,
  holdRoamer,
  MAX_ROAM_CELLS,
  newRoamer,
  ROAM_HOLD,
  stepRoamer,
  validFolkWire,
  type RoamEnv,
} from './roam';

const open = (rnd = mulberry32(7)): RoamEnv => ({ rnd, canMove: () => true });

/** Run `seconds` of frames, calling `each` after every one. */
function run(r: ReturnType<typeof newRoamer>, env: RoamEnv, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepRoamer(r, 1 / 60, env);
    each?.();
  }
}

describe('roaming people', () => {
  it('strolls away from the post and never beyond the radius', () => {
    const r = newRoamer(500, 500, 3);
    let far = 0;
    run(r, open(), 120, () => {
      far = Math.max(far, Math.hypot(r.x - r.homeX, r.y - r.homeY));
    });
    expect(far).toBeGreaterThan(CELL); // it did roam
    expect(far).toBeLessThanOrEqual(3 * CELL + 1);
  });

  it('a radius of 0 stands still, and the radius is capped', () => {
    const still = newRoamer(100, 100, 0);
    run(still, open(), 30);
    expect([still.x, still.y]).toEqual([100, 100]);
    expect(newRoamer(0, 0, 99).radius).toBe(MAX_ROAM_CELLS * CELL);
  });

  it('only steps where canMove allows (a wall or a body is never entered)', () => {
    const wallX = 520; // nothing may stand east of this line
    const env: RoamEnv = { rnd: mulberry32(3), canMove: (x) => x < wallX };
    const r = newRoamer(500, 500, 5);
    run(r, env, 200, () => expect(r.x).toBeLessThan(wallX));
  });

  it('a person who cannot move at all just stays, and does not stall or spin', () => {
    const env: RoamEnv = { rnd: mulberry32(1), canMove: () => false };
    const r = newRoamer(300, 300, 4);
    run(r, env, 60);
    expect([r.x, r.y]).toEqual([300, 300]);
    expect(r.mode).toBe('idle');
  });

  it('stops and faces whoever talks, then walks back to the post', () => {
    const r = newRoamer(500, 500, 4);
    run(r, open(), 30);
    r.x = 560; // somewhere away from the post
    r.y = 500;
    holdRoamer(r, 560 + 20, 500);
    expect(r.facing).toBe('right');
    expect(r.mode).toBe('hold');
    const at = [r.x, r.y];
    run(r, open(), ROAM_HOLD - 0.2);
    expect([r.x, r.y]).toEqual(at); // held still
    run(r, open(), 0.5);
    expect(r.mode).toBe('home');
    run(r, open(), 10, () => {});
    expect(Math.hypot(r.x - r.homeX, r.y - r.homeY)).toBeLessThan(CELL * 4 + 1);
    // returning, it reached the post before it strolled again
    const back = newRoamer(500, 500, 4);
    back.x = 530;
    holdRoamer(back, 0, 0, 0);
    let home = false;
    run(back, open(), 6, () => {
      if (Math.hypot(back.x - 500, back.y - 500) < 1.5) home = true;
    });
    expect(home).toBe(true);
  });

  it('the wire round-trips and rejects a bad list', () => {
    const wire = folkWire([
      { x: 100.4, y: 200.6, facing: 'left' },
      { x: 5, y: 6, facing: 'up' },
    ]);
    expect(wire).toEqual([100, 201, 2, 5, 6, 1]);
    expect(folkFromWire(wire)).toEqual([
      { x: 100, y: 201, facing: 'left' },
      { x: 5, y: 6, facing: 'up' },
    ]);
    expect(validFolkWire(wire)).toBe(true);
    expect(validFolkWire([1, 2])).toBe(false);
    expect(validFolkWire([1, 2, 9])).toBe(false);
    expect(validFolkWire([1.5, 2, 0])).toBe(false);
    expect(validFolkWire('x')).toBe(false);
    expect(folkFromWire(undefined)).toEqual([]);
  });
});
