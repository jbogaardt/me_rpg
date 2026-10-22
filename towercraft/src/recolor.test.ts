import { describe, expect, it } from 'vitest';
import { hexToHsl, hslToHex, recolor, RACE_HUE, shadeOf } from './recolor';

const px = (hex: number, a = 255) => new Uint8ClampedArray([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, a]);
const hex = (data: Uint8ClampedArray) => (data[0]! << 16) | (data[1]! << 8) | data[2]!;

describe('colour conversions', () => {
  it('round-trip through HSL', () => {
    for (const v of [0x000000, 0xffffff, 0x7b2fb0, 0xe7682f, 0x406181, 0x3ca54a, 0xb82024]) {
      const back = hslToHex(hexToHsl(v));
      // Rounding may move a channel by one step.
      for (const shift of [16, 8, 0])
        expect(Math.abs(((back >> shift) & 255) - ((v >> shift) & 255))).toBeLessThanOrEqual(1);
    }
  });
});

describe('recolor', () => {
  it('paints purple pixels in the seat colour and leaves wood and stone alone', () => {
    const data = new Uint8ClampedArray([...px(0x7b2fb0), ...px(0x8b5a2b), ...px(0x9a9a9a)]);
    recolor(data, hexToHsl(0x3ca54a)); // green
    const [roof, wood, stone] = [data.subarray(0, 4), data.subarray(4, 8), data.subarray(8, 12)];
    const green = hexToHsl(hex(roof));
    expect(green.h).toBeGreaterThan(90);
    expect(green.h).toBeLessThan(140);
    expect(hex(wood)).toBe(0x8b5a2b);
    expect(hex(stone)).toBe(0x9a9a9a);
  });

  it('keeps alpha and skips transparent pixels', () => {
    const data = new Uint8ClampedArray([...px(0x7b2fb0, 0), ...px(0x7b2fb0, 128)]);
    recolor(data, hexToHsl(0xb82024));
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(128);
    expect(hex(data.subarray(0, 4))).toBe(0x7b2fb0);
  });

  it('gives each shade of a race its own lightness', () => {
    const base = new Uint8ClampedArray(px(0x7b2fb0));
    const lighter = new Uint8ClampedArray(base);
    recolor(base, shadeOf(RACE_HUE.titan!, 0));
    recolor(lighter, shadeOf(RACE_HUE.titan!, 1));
    expect(hexToHsl(hex(lighter)).l).toBeGreaterThan(hexToHsl(hex(base)).l);
  });
});
