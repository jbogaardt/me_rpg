import { describe, expect, it } from 'vitest';
import { darknessAlpha, FADE_CELLS } from './darkness';
import { parseMap } from './types';

describe('darknessAlpha', () => {
  const W = 12;
  const ground = Array.from({ length: W }, (_, i) => (i < 2 ? null : ([0, 0, 0] as [number, number, number])));
  const data = parseMap({ version: 2, width: W, height: 1, ground, collision: [0, 1] });

  it('is black in the darkness and fades to nothing', () => {
    const a = darknessAlpha(data)!;
    expect(a[0]).toBe(1);
    expect(a[2]).toBe(1); // right beside the wall
    expect(a[3]!).toBeLessThan(a[2]!);
    expect(a[2 + FADE_CELLS + 1]).toBe(0);
  });

  it('is null without darkness', () => {
    expect(
      darknessAlpha(
        parseMap({
          version: 2,
          width: 2,
          height: 1,
          ground: [
            [0, 0, 0],
            [0, 0, 0],
          ],
        }),
      ),
    ).toBeNull();
  });
});
