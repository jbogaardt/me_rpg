import { describe, expect, it } from 'vitest';
import { sharpen } from './crisp';

describe('sharpen', () => {
  it('pushes a pixel away from its neighbours and leaves flat colour and transparency alone', () => {
    const px = (v: number, a = 255): number[] => [v, v, v, a];
    // 3x3: a bright middle among darker neighbours
    const d = new Uint8ClampedArray(Array.from({ length: 9 }).flatMap((_, i) => (i === 4 ? px(150) : px(100))));
    sharpen(d, 3, 3, 0.5);
    expect(d[4 * 4]).toBe(175);
    const flat = new Uint8ClampedArray(Array.from({ length: 9 }).flatMap(() => px(90)));
    sharpen(flat, 3, 3, 0.5);
    expect(flat[16]).toBe(90);
    const clear = new Uint8ClampedArray(Array.from({ length: 9 }).flatMap((_, i) => (i === 4 ? px(150, 0) : px(100))));
    sharpen(clear, 3, 3, 0.5);
    expect(clear[16]).toBe(150);
  });
});
