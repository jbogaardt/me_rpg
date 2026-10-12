// Colour maths and the per-pixel recolour shared by the tileset generators (recolor.ts, trees.ts).

import type { Image } from './image';

export type RGB = [number, number, number];

export function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Apply `fn` to every opaque pixel (optionally only inside `box`); `fn` returns the new colour. */
export function recolor(img: Image, fn: (c: RGB) => RGB | null, box?: Box): Image {
  const out: Image = { width: img.width, height: img.height, data: Buffer.from(img.data) };
  for (let y = box?.y ?? 0; y < (box ? box.y + box.h : img.height); y++) {
    for (let x = box?.x ?? 0; x < (box ? box.x + box.w : img.width); x++) {
      const i = (y * img.width + x) * 4;
      if (out.data[i + 3] === 0) continue;
      const res = fn([out.data[i], out.data[i + 1], out.data[i + 2]]);
      if (!res) continue;
      out.data[i] = clamp(Math.round(res[0]), 0, 255);
      out.data[i + 1] = clamp(Math.round(res[1]), 0, 255);
      out.data[i + 2] = clamp(Math.round(res[2]), 0, 255);
    }
  }
  return out;
}
