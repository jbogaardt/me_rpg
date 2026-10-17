import { describe, expect, it } from 'vitest';
import { Camera, SHAKE_PX, chase, followOffset, pickZoom, shakeOffset, viewRect } from './camera';
import type { Container } from 'pixi.js';

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

describe('shakeOffset', () => {
  it('wobbles within its amplitude and fades to nothing at its end', () => {
    for (let t = 0; t < 0.4; t += 0.01) {
      const o = shakeOffset(t, 0.4, 6);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(6);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(6);
      expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true);
    }
    expect(shakeOffset(0.4, 0.4, 6)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(0.1, 0, 6)).toEqual({ x: 0, y: 0 });
  });
});

describe('Camera.shake', () => {
  /** A stand-in for the world container that records where the camera puts it. */
  function rig() {
    const at = { x: 0, y: 0 };
    const world = { scale: { set() {} }, position: { set: (x: number, y: number) => ((at.x = x), (at.y = y)) } };
    const camera = new Camera(world as unknown as Container);
    const bounds = { left: 0, top: 0, right: 4000, bottom: 4000 };
    const frame = (dt: number) => camera.follow(640, 440, 2000, 2000, bounds, dt);
    return { at, camera, frame };
  }

  it('moves the view off its place while it runs, then puts it back exactly', () => {
    const { at, camera, frame } = rig();
    frame(0); // settle
    const home = { ...at };
    camera.shake(1, 0.5);
    let moved = false;
    for (let i = 0; i < 8; i++) {
      frame(1 / 60);
      moved ||= at.x !== home.x || at.y !== home.y;
      expect(Math.abs(at.x - home.x)).toBeLessThanOrEqual(SHAKE_PX);
    }
    expect(moved).toBe(true);
    for (let i = 0; i < 40; i++) frame(1 / 60);
    expect(at).toEqual(home);
  });

  it('does not let a weak shake cut a strong one short', () => {
    const { camera } = rig();
    camera.shake(1, 1);
    camera.shake(0.1, 0.2);
    expect((camera as unknown as { rattle: { amplitude: number } }).rattle.amplitude).toBe(SHAKE_PX);
  });
});
