import { describe, expect, it } from 'vitest';
import { distanceLabel, edgeArrow } from './edgeArrow';

const view = { x: 0, y: 0, w: 800, h: 600 };

describe('edgeArrow', () => {
  it('is null for a partner on screen', () => {
    expect(edgeArrow(view, 800, 600, 400, 300)).toBeNull();
  });
  it('points right from the right edge', () => {
    const a = edgeArrow(view, 800, 600, 2000, 300, 20)!;
    expect(a.x).toBeCloseTo(780);
    expect(a.y).toBeCloseTo(300);
    expect(a.angle).toBeCloseTo(0);
    expect(a.dist).toBeCloseTo(1600);
  });
  it('lands on the top edge for a partner above', () => {
    const a = edgeArrow(view, 800, 600, 400, -900, 20)!;
    expect(a.y).toBeCloseTo(20);
    expect(a.x).toBeCloseTo(400);
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
  });
  it('stays inside the inset on a diagonal and scales with zoom', () => {
    const zoomed = { x: 0, y: 0, w: 400, h: 300 }; // zoom 2
    const a = edgeArrow(zoomed, 800, 600, 1000, 1000, 20)!;
    expect(a.x).toBeLessThanOrEqual(780.001);
    expect(a.y).toBeLessThanOrEqual(580.001);
    expect(Math.max(a.x - 780, a.y - 580)).toBeCloseTo(0);
  });
});

describe('distanceLabel', () => {
  it('counts tiles, at least one', () => {
    expect(distanceLabel(320, 32)).toBe('10');
    expect(distanceLabel(1, 32)).toBe('1');
  });
});
