import { describe, expect, it } from 'vitest';
import { DIRS } from '../core/direction';
import {
  FACING_ANGLE,
  SLASH_DURATION,
  SLASH_SEGMENTS,
  slashPolygon,
  slashRadius,
  slashShape,
  slashStage,
} from './slashArc';

const poly = () => new Array<number>(4 * (SLASH_SEGMENTS + 1)).fill(0);

describe('slashArc', () => {
  it('lasts 120-180 ms in three stages', () => {
    expect(SLASH_DURATION).toBeGreaterThanOrEqual(0.12);
    expect(SLASH_DURATION).toBeLessThanOrEqual(0.18);
    expect([0, 0.2, 0.5, 0.6, 0.8, 1].map(slashStage)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('grows with the weapon reach', () => {
    expect(slashRadius(30)).toBeGreaterThan(slashRadius(22));
  });

  it('sweeps the head forward, tapers the tail and fades out', () => {
    const r = slashRadius(22);
    let head = -Infinity;
    for (let p = 0; p <= 1; p += 0.05) {
      const s = slashShape(p, r);
      expect(s.head).toBeGreaterThanOrEqual(head);
      head = s.head;
      expect(s.tail).toBeLessThanOrEqual(s.head);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
    expect(slashShape(1, r).alpha).toBe(0);
    expect(slashShape(0.6, r).head).toBeGreaterThan(0.8); // the blade has crossed most of the arc by the strike
  });

  it.each(DIRS)('%s: the crescent sits ahead of the hero and within the radius', (dir) => {
    const r = slashRadius(22);
    const out = slashPolygon(poly(), slashShape(0.5, r), r, FACING_ANGLE[dir]);
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < out.length; i += 2) {
      const x = out[i] as number;
      const y = out[i + 1] as number;
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(r + 1e-6);
      sx += x;
      sy += y;
    }
    const [fx, fy] = [Math.cos(FACING_ANGLE[dir]), Math.sin(FACING_ANGLE[dir])];
    expect(sx * fx + sy * fy).toBeGreaterThan(0);
  });

  it('reuses the buffer it is given', () => {
    const buf = poly();
    expect(slashPolygon(buf, slashShape(0.3, 38), 38, 0)).toBe(buf);
  });
});
