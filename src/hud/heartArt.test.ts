import { describe, expect, it } from 'vitest';
import { COIN_FULL, HEART_EMPTY, HEART_FULL, HEART_SIZE, gridSvg, heartFullUrl } from './heartArt';

describe('the HUD pixel art', () => {
  it('turns a grid into one rect per run of pixels', () => {
    const svg = gridSvg(['aab', '.ba'], { a: '#111', b: '#222' });
    expect(svg).toContain('<rect x="0" y="0" width="2" height="1" fill="#111"/>');
    expect(svg).toContain('<rect x="2" y="0" width="1" height="1" fill="#222"/>');
    expect(svg).toContain('<rect x="1" y="1" width="1" height="1" fill="#222"/>');
    expect(svg).toContain('crispEdges');
    expect((svg.match(/<rect/g) ?? []).length).toBe(4);
  });

  it('draws the heart and coin only from colours its palette defines', () => {
    expect(HEART_SIZE).toEqual({ w: 11, h: 10 });
    expect(heartFullUrl()).toMatch(/^url\("data:image\/svg\+xml,/);
    for (const p of [HEART_FULL, HEART_EMPTY, COIN_FULL])
      for (const c of Object.values(p)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
