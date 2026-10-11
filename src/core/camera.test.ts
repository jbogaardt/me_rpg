import { describe, expect, it } from 'vitest';
import { followOffset, pickZoom, viewRect } from './camera';

describe('viewRect', () => {
  it('is the screen in world px', () => {
    expect(viewRect(1280, 960, -200, -100, 2)).toEqual({ x: 100, y: 50, w: 640, h: 480 });
  });
});

describe('pickZoom', () => {
  it('uses the largest whole number that fits the 640x480 design view', () => {
    expect(pickZoom(640, 480)).toBe(1);
    expect(pickZoom(1279, 959)).toBe(1);
    expect(pickZoom(1280, 960)).toBe(2);
    expect(pickZoom(1920, 1080)).toBe(2); // height-limited
    expect(pickZoom(2560, 1440)).toBe(3);
  });

  it('never goes below 1, even on tiny screens', () => {
    expect(pickZoom(320, 240)).toBe(1);
  });
});

describe('followOffset', () => {
  const screen = 640;
  const map = 1280;

  it('centres the target in the middle of the map', () => {
    expect(followOffset(screen, map, 640, 1)).toBe(-320);
  });

  it('stops at the map edges instead of showing past them', () => {
    expect(followOffset(screen, map, 10, 1)).toBe(0); // near the start
    expect(followOffset(screen, map, 1270, 1)).toBe(screen - map); // near the end
  });

  it('centres a map that is smaller than the screen', () => {
    expect(followOffset(800, 480, 100, 1)).toBe(160);
  });

  it('accounts for zoom and rounds to whole pixels', () => {
    expect(followOffset(1280, 2560, 640, 2)).toBe(-640);
    expect(Number.isInteger(followOffset(641, 1280, 333, 1))).toBe(true);
  });
});
