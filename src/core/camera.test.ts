import { describe, expect, it } from 'vitest';
import { chase, followOffset, pickZoom, viewRect } from './camera';

describe('pickZoom', () => {
  it('takes the whole number nearest the design size, never below 1', () => {
    expect(pickZoom(640, 440)).toBe(1);
    expect(pickZoom(640, 480)).toBe(1);
    expect(pickZoom(1366, 768)).toBe(2);
    expect(pickZoom(1920, 1080)).toBe(2);
    expect(pickZoom(2560, 1440)).toBe(3);
    expect(pickZoom(390, 844)).toBe(1);
    expect(pickZoom(320, 240)).toBe(1);
  });
});

describe('followOffset', () => {
  it('centres the target', () => {
    expect(followOffset(640, 0, 2560, 1280, 1)).toBe(-960);
  });

  it('stops at the edges of the allowed rectangle, not the map', () => {
    expect(followOffset(640, 500, 2000, 510, 1)).toBe(-500); // near the left bound: its edge sits on the screen's edge
    expect(followOffset(640, 500, 2000, 1990, 1)).toBe(640 - 2000); // near the right bound
  });

  it('centres a span smaller than the screen', () => {
    expect(followOffset(800, 100, 580, 300, 1)).toBe(800 / 2 - 340);
  });

  it('works at any zoom and gives whole numbers', () => {
    expect(followOffset(1280, 0, 1280, 640, 2)).toBe(-640);
    expect(Number.isInteger(followOffset(641, 0, 1280, 333, 1))).toBe(true);
  });
});

describe('chase', () => {
  it('closes in without overshooting, at the same pace whatever the frame rate', () => {
    expect(chase(0, 100, 9, 0)).toBe(0);
    expect(chase(0, 100, 9, 10)).toBeGreaterThan(99.9);
    const twice = chase(chase(0, 100, 9, 1 / 60), 100, 9, 1 / 60);
    expect(twice).toBeCloseTo(chase(0, 100, 9, 2 / 60), 6);
  });
});

describe('viewRect', () => {
  it('is the part of the world on screen', () => {
    expect(viewRect(640, 480, -100, -50, 2)).toEqual({ x: 50, y: 25, w: 320, h: 240 });
  });
});
