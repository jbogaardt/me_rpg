import { describe, expect, it } from 'vitest';
import type { HearthSource } from './hearths';
import { flicker, glowStrength, LIGHT_RADIUS, visibleLights } from './lights';

const view = { x: 0, y: 0, w: 400, h: 300 };
const src = (kind: HearthSource['kind'], x: number, y: number): HearthSource => ({ kind, x, y });

describe('flicker', () => {
  it('stays close to steady', () => {
    for (let t = 0; t < 20; t += 0.1) expect(Math.abs(flicker(t, 3) - 1)).toBeLessThan(0.1);
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

describe('flame brightness', () => {
  it('gives every flickering light a brightness between a gutter and full, and lava none', () => {
    const got = visibleLights([src('torch', 50, 50), src('torch', 90, 50), src('lava', 60, 60)], view, 3.3);
    for (const l of got.slice(0, 2)) {
      expect(l.f).toBeGreaterThanOrEqual(0.65);
      expect(l.f).toBeLessThanOrEqual(1);
    }
    expect(got[2]!.f).toBe(0.9);
    expect(got[0]!.f).not.toBe(got[1]!.f);
  });
});
