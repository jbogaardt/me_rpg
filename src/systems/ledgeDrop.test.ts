import { describe, expect, it } from 'vitest';
import { CELL, type LedgeSpawn } from '../map/types';
import { Collision } from './collision';
import {
  DROP_CONFIRM_S,
  HOP_GRACE,
  HOP_LIFT,
  HOP_TIME,
  dropHold,
  dropTarget,
  hopLift,
  hopSquash,
  startHop,
  stepHop,
} from './ledgeDrop';

// A plateau edge on row 3 (cols 2..4), a 2-row face on rows 4 and 5, the landing on row 6.
const ledge: LedgeSpawn = { col: 2, row: 3, w: 3, land: 6 };
const always = () => true;

describe('dropHold', () => {
  it('confirms only after DROP_CONFIRM_S of pushing, and a release starts over', () => {
    let h = 0;
    for (let i = 0; i < 4; i++) h = dropHold(h, true, 1 / 60);
    expect(h).toBeLessThan(DROP_CONFIRM_S);
    h = dropHold(h, false, 1 / 60);
    expect(h).toBe(0);
    for (let i = 0; i < 6; i++) h = dropHold(h, true, 1 / 60);
    expect(h).toBeGreaterThanOrEqual(DROP_CONFIRM_S - 1e-9);
  });
});

describe('dropTarget', () => {
  it('drops from the edge row to the middle of the landing cell below', () => {
    expect(dropTarget([ledge], 3 * CELL + 5, 3 * CELL + 20, always)).toEqual({ x: 3 * CELL + CELL / 2, y: 6.5 * CELL });
  });
  it('counts feet a pixel into the face row (the collision box ends at y - 1)', () => {
    expect(dropTarget([ledge], 3 * CELL, 4 * CELL, always)).toBeDefined();
  });
  it('is not offered from other rows, outside the span, or without ledges', () => {
    expect(dropTarget([ledge], 3 * CELL, 2 * CELL + 10, always)).toBeUndefined();
    expect(dropTarget([ledge], 5 * CELL + 4, 3 * CELL + 10, always)).toBeUndefined();
    expect(dropTarget([ledge], 1 * CELL, 3 * CELL + 10, always)).toBeUndefined();
    expect(dropTarget(undefined, 3 * CELL, 3 * CELL + 10, always)).toBeUndefined();
  });
  it('does not start when the landing does not fit the map', () => {
    expect(dropTarget([ledge], 3 * CELL, 3 * CELL + 10, () => false)).toBeUndefined();
  });
  it('a hero walking south on the edge row stops against the blocked face still inside the ledge', () => {
    const w = 8;
    const blocked: number[] = [];
    for (let c = 0; c < w; c++) for (const r of [4, 5]) blocked.push(r * w + c);
    const col = new Collision(w, 8, blocked);
    const body = { x: 3 * CELL + 16, y: 3 * CELL + 4 };
    for (let i = 0; i < 40; i++) col.slide(body, 0, 2, []);
    expect(dropTarget([ledge], body.x, body.y, (x, y) => col.fitsMap(x, y))).toBeDefined();
  });
});

describe('the hop', () => {
  it('takes HOP_TIME however the ticks fall, ends exactly at the landing and moves straight toward it', () => {
    for (const dt of [1 / 60, 1 / 30, 0.1]) {
      const to = { x: 100, y: 200 };
      const h = startHop({ x: 90, y: 100 }, to);
      let t = 0;
      let last = { x: 90, y: 100, done: false };
      let prevY = 100;
      while (!last.done) {
        last = stepHop(h, dt);
        t += dt;
        expect(last.y).toBeGreaterThanOrEqual(prevY);
        prevY = last.y;
      }
      expect(t).toBeGreaterThanOrEqual(HOP_TIME);
      expect(t).toBeLessThan(HOP_TIME + dt + 1e-9);
      expect(last).toEqual({ x: 100, y: 200, done: true });
    }
  });
  it('lifts the body in an arc that is flat at both ends and peaks at HOP_LIFT', () => {
    expect(hopLift(0)).toBe(0);
    expect(hopLift(HOP_TIME)).toBeCloseTo(0);
    expect(hopLift(HOP_TIME / 2)).toBeCloseTo(HOP_LIFT);
  });
  it('squashes on landing and recovers to the plain body', () => {
    expect(hopSquash(HOP_TIME, 0).sy).toBeLessThan(0.85);
    expect(hopSquash(HOP_TIME, 1)).toEqual({ sx: 1, sy: 1 });
  });
  it('is silent immunity longer than the hop itself', () => {
    expect(HOP_GRACE).toBeGreaterThan(HOP_TIME);
    expect(HOP_TIME).toBeGreaterThanOrEqual(0.35);
    expect(HOP_TIME).toBeLessThanOrEqual(0.45);
  });
});
