// Small image helpers for the tools that compose a sheet out of cut pieces of other art (town.ts, interior.ts).

import type { Image } from './image';

export const blank = (width: number, height: number): Image => ({
  width,
  height,
  data: Buffer.alloc(width * height * 4),
});

/** A rectangle of `img` as an image of its own. */
export function crop(img: Image, x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++)
    img.data.copy(out.data, yy * w * 4, ((y + yy) * img.width + x) * 4, ((y + yy) * img.width + x + w) * 4);
  return out;
}

/** Draw the opaque pixels of `src` over `dst` at (dx, dy). */
export function over(dst: Image, src: Image, dx: number, dy: number) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] === 0) continue;
      src.data.copy(dst.data, (ty * dst.width + tx) * 4, i, i + 4);
    }
}

/** `piece` repeated across w x h. */
export function tiled(piece: Image, w: number, h: number): Image {
  const out = blank(w, h);
  for (let y = 0; y < h; y += piece.height) for (let x = 0; x < w; x += piece.width) over(out, piece, x, y);
  return out;
}
