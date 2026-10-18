import { describe, expect, it } from 'vitest';
import {
  keepClear,
  MAX_PULSES,
  newPulse,
  newThreat,
  pickPulses,
  pulseAlpha,
  pulseScale,
  type Threat,
} from './threatPulse';

// A phone in portrait at zoom 2: 390x844 px show 195x422 world px, so the hero sees ~97 px to each side.
const W = 390;
const H = 844;
const view = { x: 1000, y: 1000, w: 195, h: 422 };
const threat = (id: number, dx: number, dy: number, progress: number): Threat => ({
  ...newThreat(),
  id,
  x: 1000 + 97 + dx,
  y: 1000 + 211 + dy,
  progress,
  color: 0x66ccff,
});
const pool = () => Array.from({ length: MAX_PULSES }, newPulse);

describe('pickPulses', () => {
  it('gives no pulse to a shooter on screen', () => {
    const out = pool();
    expect(pickPulses(out, [threat(0, 40, 0, 0.5), threat(1, -90, 100, 0.2)], 2, view, W, H)).toBe(0);
  });

  it('puts an east shooter on the right edge pointing right, a west one on the left', () => {
    const out = pool();
    expect(pickPulses(out, [threat(0, 150, 0, 0.4)], 1, view, W, H)).toBe(1);
    expect(out[0]!.x).toBeGreaterThan(W - 30);
    expect(out[0]!.angle).toBeCloseTo(0, 1);
    expect(pickPulses(out, [threat(0, -150, 0, 0.4)], 1, view, W, H)).toBe(1);
    expect(out[0]!.x).toBeLessThan(30);
    expect(Math.abs(out[0]!.angle)).toBeCloseTo(Math.PI, 1);
  });

  it('keeps at most three, the soonest to strike first, then the nearest', () => {
    const out = pool();
    const ts = [
      threat(0, 300, 0, 0.1),
      threat(1, 200, 0, 0.9),
      threat(2, -250, 0, 0.5),
      threat(3, 150, 0, 0.5),
      threat(4, -400, 0, 0.7),
    ];
    const n = pickPulses(out, ts, ts.length, view, W, H);
    expect(n).toBe(3);
    expect(out.slice(0, n).map((p) => p.id)).toEqual([1, 4, 3]); // 0.9, 0.7, then the nearer of the two 0.5s
  });

  it('only reads the first `count` threats', () => {
    const out = pool();
    expect(pickPulses(out, [threat(0, 300, 0, 0.5), threat(1, 300, 0, 0.5)], 1, view, W, H)).toBe(1);
  });
});

describe('keepClear', () => {
  it('moves a pulse out from under the touch stick and the A button, not on desktop', () => {
    const left = { x: 18, y: H - 40 };
    keepClear(left, W, H, true);
    expect(left.y).toBeLessThan(H - 172);
    const right = { x: W - 18, y: H - 60 };
    keepClear(right, W, H, true);
    expect(right.y).toBeLessThan(H - 172);
    const desk = { x: 18, y: H - 40 };
    keepClear(desk, W, H, false);
    expect(desk).toEqual({ x: 18, y: H - 40 });
  });

  it('keeps pulses off the HUD row and the item button but leaves free edge alone', () => {
    const top = { x: 100, y: 18 };
    keepClear(top, W, H, false);
    expect(top.y).toBeGreaterThan(58);
    const item = { x: W - 54, y: H - 60 };
    keepClear(item, W, H, false);
    expect(item.x <= W - 84 - 14 || item.y <= H - 88 - 14).toBe(true);
    const itemTouch = { x: W - 142, y: H - 146 };
    keepClear(itemTouch, W, H, true);
    expect(itemTouch.x <= W - 172 - 14 || itemTouch.y <= H - 176 - 14).toBe(true);
    const free = { x: 18, y: H / 2 };
    keepClear(free, W, H, true);
    expect(free).toEqual({ x: 18, y: H / 2 });
  });

  it.each([
    [390, 844],
    [360, 640],
    [844, 390],
  ])('keeps a pulse off the dodge roll button at %ix%i, and clear of A and the item button too', (w, h) => {
    // ui.css: #btn-roll is 60 px, 12 px left of A, its bottom 36 px up; the item button sits above it, A to its right.
    const roll = { x: w - 150, y: h - 66 };
    keepClear(roll, w, h, true);
    const inRoll = roll.x > w - 180 - 14 && roll.x < w - 120 + 14 && roll.y > h - 96 - 14 && roll.y < h - 36 + 14;
    expect(inRoll).toBe(false);
    const desk = { x: w - 150, y: h - 66 };
    keepClear(desk, w, h, false); // no touch cluster on desktop: nothing to clear
    expect(desk).toEqual({ x: w - 150, y: h - 66 });
  });

  it.each([
    [390, 844],
    [360, 640],
    [844, 390],
    [1280, 720],
  ])('leaves a pulse inside the screen at %ix%i', (w, h) => {
    for (const touch of [true, false]) {
      for (const [x, y] of [
        [10, 10],
        [w - 10, 10],
        [10, h - 10],
        [w - 10, h - 10],
        [w / 2, h - 10],
        [w - 10, h * 0.38],
      ] as const) {
        const p = { x, y };
        keepClear(p, w, h, touch);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(h);
      }
    }
  });
});

describe('closing intensity', () => {
  it('brightens and closes toward the strike, solid for the last moment', () => {
    expect(pulseScale(0)).toBeGreaterThan(pulseScale(1));
    expect(pulseScale(2)).toBe(pulseScale(1));
    const mean = (p: number) => [0, 0.1, 0.2, 0.3].reduce((s, t) => s + pulseAlpha(p, t), 0) / 4;
    expect(mean(0.6)).toBeGreaterThan(mean(0.1));
    expect(pulseAlpha(0.9, 0.123)).toBe(1);
    expect(pulseAlpha(0.05, 0.3)).toBeLessThan(0.4);
  });
});
