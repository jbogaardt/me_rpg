import { describe, expect, it } from 'vitest';
import type { HearthSource } from './hearths';
import { flameBrightness, flicker, flickerSeed, glowStrength, LIGHT_RADIUS, visibleLights } from './lights';

const view = { x: 0, y: 0, w: 400, h: 300 };
const src = (kind: HearthSource['kind'], x: number, y: number): HearthSource => ({ kind, x, y });

describe('flicker', () => {
  it('stays close to steady', () => {
    for (let t = 0; t < 20; t += 0.1) expect(Math.abs(flicker(t, 3) - 1)).toBeLessThan(0.13);
  });

  it('actually moves, and differs between torches', () => {
    const at = (seed: number) => Array.from({ length: 200 }, (_, i) => flameBrightness(i * 0.05, seed));
    const a = at(flickerSeed(10, 20));
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.1);
    expect(Math.min(...a)).toBeGreaterThan(0.6);
    expect(Math.max(...a)).toBeLessThan(1.25);
    expect(a).not.toEqual(at(flickerSeed(11, 20)));
    expect(flickerSeed(10, 20)).toBe(flickerSeed(10, 20));
  });
});

describe('visibleLights reuse', () => {
  it('fills and trims the array it is given, reusing the light objects', () => {
    const out = visibleLights([src('torch', 10, 10), src('torch', 50, 50)], view, 1);
    const first = out[0];
    visibleLights([src('torch', 10, 10)], view, 2, out);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(first);
  });
});

describe('visibleLights', () => {
  it('lights fires, torches and lava, and not smoke-only sources', () => {
    const got = visibleLights(
      [
        src('fire', 100, 100),
        src('torch', 200, 100),
        src('lava', 300, 100),
        src('drip', 50, 50),
        src('firefly', 60, 60),
      ],
      view,
      0,
    );
    expect(got).toHaveLength(3);
  });

  it('leaves out a pool that cannot reach the screen, and keeps one whose edge does', () => {
    const r = LIGHT_RADIUS.fire!;
    expect(visibleLights([src('fire', 400 + r + 10, 100)], view, 0)).toEqual([]);
    expect(visibleLights([src('fire', 400 + r - 10, 100)], view, 0)).toHaveLength(1);
  });
});

describe('glowStrength', () => {
  it('is nothing at noon and strong at night', () => {
    expect(glowStrength(0xffffff)).toBe(0);
    expect(glowStrength(0x2a3a66)).toBeGreaterThan(0.8);
  });
});
