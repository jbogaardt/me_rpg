import { describe, expect, it } from 'vitest';
import type { HearthSource } from './hearths';
import { flicker, LIGHT_RADIUS, visibleLights } from './lights';

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
