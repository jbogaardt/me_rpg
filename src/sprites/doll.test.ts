import { describe, expect, it } from 'vitest';
import {
  ANIMS,
  DOLL_HEIGHT,
  DOLL_WIDTH,
  feetAnchor,
  frameRect,
  outfitKey,
  outfitLayers,
  withGear,
  type PartManifest,
} from './doll';

const manifest: PartManifest = {
  'body.a': [{ file: 'body.a.0.png', z: 10 }],
  'hair.a': [{ file: 'hair.a.0.png', z: 120 }],
  'weapon.a': [
    { file: 'weapon.a.0.png', z: 140 }, // in front of the body
    { file: 'weapon.a.1.png', z: 9 }, // behind it (the part of the sword held behind the back)
  ],
  'cape.a': [
    { file: 'cape.a.0.png', z: 85 },
    { file: 'cape.a.1.png', z: 5 },
  ],
};

describe('doll sheet layout', () => {
  it('fits every animation block inside the sheet without overlap', () => {
    const blocks = Object.values(ANIMS).sort((a, b) => a.y - b.y);
    let end = 0;
    for (const a of blocks) {
      expect(a.y).toBeGreaterThanOrEqual(end);
      end = a.y + a.size * a.rows;
      expect(a.cols * a.size).toBeLessThanOrEqual(DOLL_WIDTH);
    }
    expect(end).toBeLessThanOrEqual(DOLL_HEIGHT);
  });

  it('only plays frame columns that exist', () => {
    for (const a of Object.values(ANIMS)) expect(Math.max(...a.cycle)).toBeLessThan(a.cols);
  });

  it('finds frames in LPC row order (up, left, down, right)', () => {
    expect(frameRect('walk', 'up', 0)).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    expect(frameRect('walk', 'down', 3)).toEqual({ x: 192, y: 128, w: 64, h: 64 });
    expect(frameRect('walk', 'right', 0).y).toBe(192);
    expect(frameRect('slash', 'left', 2)).toEqual({ x: 256, y: ANIMS.slash.y + 128, w: 128, h: 128 });
  });

  it('shares one row between directions for hurt', () => {
    expect(frameRect('hurt', 'up', 1)).toEqual(frameRect('hurt', 'right', 1));
  });

  it('keeps the feet on the same spot in 64px and 128px frames', () => {
    // The 64px frame sits in the middle of the 128px one, so the feet are 32px lower there.
    expect(feetAnchor('slash') * 128 - 32).toBeCloseTo(feetAnchor('walk') * 64);
  });
});

describe('outfits', () => {
  it('draws layers back to front by z, whatever order the slots are in', () => {
    const layers = outfitLayers({ weapon: 'weapon.a', hair: 'hair.a', body: 'body.a' }, manifest);
    expect(layers.map((l) => l.file)).toEqual(['weapon.a.1.png', 'body.a.0.png', 'hair.a.0.png', 'weapon.a.0.png']);
  });

  it('lets a cape sit behind the body and over it', () => {
    const files = outfitLayers({ body: 'body.a', cape: 'cape.a' }, manifest).map((l) => l.file);
    expect(files).toEqual(['cape.a.1.png', 'body.a.0.png', 'cape.a.0.png']);
  });

  it('rejects an unknown part', () => {
    expect(() => outfitLayers({ body: 'body.nope' }, manifest)).toThrow(/body\.nope/);
  });

  it('keys outfits by content, not by property order', () => {
    expect(outfitKey({ body: 'body.a', hair: 'hair.a' })).toBe(outfitKey({ hair: 'hair.a', body: 'body.a' }));
    expect(outfitKey({ body: 'body.a' })).not.toBe(outfitKey({ body: 'body.a', hair: 'hair.a' }));
  });

  it('withGear replaces and clears slots without touching the original', () => {
    const base = { body: 'body.a', weapon: 'weapon.a' };
    const next = withGear(base, { weapon: null, hair: 'hair.a' });
    expect(next).toEqual({ body: 'body.a', hair: 'hair.a' });
    expect(base).toEqual({ body: 'body.a', weapon: 'weapon.a' });
  });
});
