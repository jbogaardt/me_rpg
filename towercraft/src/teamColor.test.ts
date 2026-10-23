import { describe, expect, it } from 'vitest';
import { isTeamPixel, recolorTeam, seatColor } from './teamColor';

describe('team colours', () => {
  it('gives seats of one race different colours, the first being the race colour', () => {
    const base = 0xe7682f;
    const colors = [0, 1, 2, 3].map((i) => seatColor(base, i));
    expect(colors[0]).toBe(base);
    expect(new Set(colors).size).toBe(4);
  });

  it('finds the sheets purple and nothing else', () => {
    expect(isTeamPixel(80, 24, 88)).toBe(true);
    expect(isTeamPixel(44, 8, 44)).toBe(true);
    expect(isTeamPixel(96, 19, 0)).toBe(false); // brown
    expect(isTeamPixel(144, 108, 40)).toBe(false);
    expect(isTeamPixel(4, 4, 4)).toBe(false);
  });

  it('recolours only the purple pixels', () => {
    const px = new Uint8ClampedArray([80, 24, 88, 255, 96, 19, 0, 255]);
    recolorTeam(px, 0xe0502a);
    expect(px[0]).toBeGreaterThan(px[2]!);
    expect([px[4], px[5], px[6]]).toEqual([96, 19, 0]);
  });
});
