import { Texture } from 'pixi.js';

/**
 * A tile of faint luminance noise laid over the ground in world space: the map's picture has about a texel per world pixel, so
 * close views would otherwise show it soft next to the crisp sprites. Pale and dark specks at a few percent keep the texture of
 * ground close up whatever its colour. Cosmetic (uses `Math.random`); one shared texture.
 */
export const GRAIN_PX = 128;

/** How strongly the grain shows at a zoom: none far out (it would shimmer), full when the ground is enlarged. */
export function grainAlpha(zoom: number, peak = 1): number {
  const t = Math.min(1, Math.max(0, (zoom - 0.5) / 0.4));
  return peak * t * t * (3 - 2 * t);
}

let tex: Texture | undefined;
export function grainTexture(): Texture {
  if (tex) return tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = GRAIN_PX;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(GRAIN_PX, GRAIN_PX);
  // Two scales of noise (fine specks and a looser mottling), wrapped so the tile repeats without a seam.
  const coarse = new Float32Array(16 * 16).map(() => Math.random());
  const at = (x: number, y: number) => coarse[((y + 16) % 16) * 16 + ((x + 16) % 16)]!;
  for (let y = 0; y < GRAIN_PX; y++)
    for (let x = 0; x < GRAIN_PX; x++) {
      const [fx, fy] = [x / 8, y / 8];
      const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
      const [tx, ty] = [fx - x0, fy - y0];
      const mott =
        (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
        (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      const v = (Math.random() - 0.5) * 0.9 + (mott - 0.5) * 0.9; // -0.9..0.9
      const i = (y * GRAIN_PX + x) * 4;
      const light = v > 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.round(Math.min(1, Math.abs(v)) * 40);
    }
  c.putImageData(img, 0, 0);
  tex = Texture.from(cv);
  tex.source.addressMode = 'repeat';
  return tex;
}
