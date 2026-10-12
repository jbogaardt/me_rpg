import { describe, expect, it } from 'vitest';
import { distanceField, fbm, maskRects, noise, smoothMask } from './noise';

describe('noise', () => {
  it('is deterministic, smooth and bounded', () => {
    const n = noise(3, 8);
    expect(n(10.5, 20.25)).toBe(noise(3, 8)(10.5, 20.25));
    expect(noise(4, 8)(10.5, 20.25)).not.toBe(n(10.5, 20.25));
    let max = 0;
    for (let x = 0; x < 200; x += 0.7) {
      max = Math.max(max, Math.abs(n(x, x / 3)));
      expect(Math.abs(n(x + 0.05, 5) - n(x, 5))).toBeLessThan(0.2); // no jumps
    }
    expect(max).toBeLessThanOrEqual(1);
    const f = fbm(1, 9);
    for (let x = 0; x < 100; x++) expect(Math.abs(f(x, x * 2))).toBeLessThan(1.7);
  });
});

describe('maskRects', () => {
  it('covers exactly the cells of the mask, one rect per run', () => {
    const on = (c: number, r: number) => (r === 1 && c >= 2 && c <= 4) || (r === 2 && (c === 0 || c === 4));
    const rects = maskRects(on, { col: 0, row: 0, w: 6, h: 4 });
    expect(rects).toEqual([
      { col: 2, row: 1, w: 3, h: 1 },
      { col: 0, row: 2, w: 1, h: 1 },
      { col: 4, row: 2, w: 1, h: 1 },
    ]);
  });
});

describe('smoothMask', () => {
  it('removes a lone cell and fills a pinhole, leaving a solid shape alone', () => {
    const w = 9,
      h = 9;
    const mask = new Uint8Array(w * h);
    for (let r = 2; r < 7; r++) for (let c = 2; c < 7; c++) mask[r * w + c] = 1;
    mask[4 * w + 4] = 0; // a pinhole
    mask[0] = 1; // a lone cell
    const out = smoothMask(mask, w, h, 1);
    expect(out[4 * w + 4]).toBe(1);
    expect(out[0]).toBe(0);
    expect(out[4 * w + 3]).toBe(1);
    expect(out[0 * w + 5]).toBe(0);
  });
});

describe('distanceField', () => {
  it('measures how far each cell is from the mask', () => {
    const w = 11,
      h = 11;
    const mask = new Uint8Array(w * h);
    mask[5 * w + 5] = 1;
    const d = distanceField(mask, w, h);
    expect(d[5 * w + 5]).toBe(0);
    expect(d[5 * w + 8]).toBeCloseTo(3, 5);
    expect(d[8 * w + 8]).toBeCloseTo(3 * Math.SQRT2, 5);
    expect(d[0]).toBeCloseTo(5 * Math.SQRT2, 5);
  });
});
