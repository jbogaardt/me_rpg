import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { Collision, type Body } from './collision';

// A 10x10 map open everywhere except a wall at column 5.
const wall = Array.from({ length: 10 }, (_, row) => row * 10 + 5);
const centre = (col: number, row: number) => [(col + 0.5) * CELL, (row + 0.9) * CELL] as const;
const body = (col: number, row: number): Body => {
  const [x, y] = centre(col, row);
  return { x, y };
};

describe('Collision', () => {
  const c = new Collision(10, 10, wall);

  it('treats cells outside the map as blocked', () => {
    expect(c.isBlocked(-1, 0)).toBe(true);
    expect(c.isBlocked(0, -1)).toBe(true);
    expect(c.isBlocked(10, 0)).toBe(true);
    expect(c.isBlocked(0, 10)).toBe(true);
    expect(c.isBlocked(0, 0)).toBe(false);
    expect(c.isBlocked(5, 3)).toBe(true);
  });

  it('checks the whole foot box, not just the centre', () => {
    const [x, y] = centre(4, 3);
    expect(c.fitsMap(x, y)).toBe(true);
    // Feet 3px short of the wall: the box's right edge (+6) pokes into column 5.
    expect(c.fitsMap(5 * CELL - 3, y)).toBe(false);
    expect(c.fitsMap(5 * CELL - 7, y)).toBe(true);
  });

  it('gives a giant a wider foot box and a wider body', () => {
    const [x, y] = centre(4, 3);
    expect(c.fitsMap(5 * CELL - 7, y)).toBe(true);
    expect(c.fitsMap(5 * CELL - 7, y, 2)).toBe(false);
    const giant: Body = { x, y, size: 2 };
    const person = { x: x - 20, y }; // 20px apart: clear of a person, inside a giant's reach
    expect(c.canMove(person, person.x + 3, y, [giant])).toBe(false);
    expect(c.canMove(person, person.x + 3, y, [{ x, y }])).toBe(true);
  });

  it('slides along a wall: the blocked axis stops, the free axis moves', () => {
    const b = body(4, 3);
    b.x = 5 * CELL - 8; // touching the wall
    const y0 = b.y;
    const moved = c.slide(b, 20, 10, []);
    expect(moved).toBe(true);
    expect(b.x).toBe(5 * CELL - 8);
    expect(b.y).toBe(y0 + 10);
  });

  it('reports no movement when fully blocked', () => {
    const b = body(4, 3);
    b.x = 5 * CELL - 7;
    expect(c.slide(b, 20, 0, [])).toBe(false);
  });

  it('is blocked by other bodies but can always move apart', () => {
    const a = body(2, 2);
    const other: Body = { x: a.x + 10, y: a.y };
    expect(c.canMove(a, a.x + 2, a.y, [other])).toBe(false); // closer to the other body
    expect(c.canMove(a, a.x - 2, a.y, [other])).toBe(true); // moving away
    expect(c.canMove(a, a.x, a.y, [a])).toBe(true); // a body never blocks itself
  });

  it('ignores hidden bodies', () => {
    const a = body(2, 2);
    const ghost: Body = { x: a.x + 10, y: a.y, visible: false };
    expect(c.canMove(a, a.x + 2, a.y, [ghost])).toBe(true);
  });

  it('opens a dried-out bed to walkers, and closes it again', () => {
    const lake = new Collision(10, 10, wall);
    expect(lake.fitsMap(5.5 * CELL, 3.9 * CELL)).toBe(false);
    lake.setBed([3 * 10 + 5]);
    expect(lake.fitsMap(5.5 * CELL, 3.9 * CELL)).toBe(true);
    expect(lake.cellsUnder(5.5 * CELL, 3.9 * CELL).has(3 * 10 + 5)).toBe(true);
    lake.setBed([]);
    expect(lake.fitsMap(5.5 * CELL, 3.9 * CELL)).toBe(false);
  });
});
