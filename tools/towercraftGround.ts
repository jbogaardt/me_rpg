// Paints Towercraft's baked fields (towercraft/public/art/maps/<id>.webp): one picture per map, bigger than the board by
// FIELD_BORDER pixels on every side (towercraft/src/fieldArt.ts). Everything here is cosmetic: the rules read only the cells
// tools/towercraftBoard.ts writes into src/sim/scenery.ts. The board tool says WHERE the road, lakes, trees and rocks are; this module
// decides what they look like:
//  - ground: Wyrmsun's plain terrain tiles (tools/towercraftGround/*.png, CC0) give each ground its fine grain (their high-pass detail,
//    sampled through three turned copies so no grid shows) over a colour of our own; several grounds blend in organic, domain-warped patches;
//  - the road: a smooth shape from the lanes' centreline (never narrower than the road cells), worn earth with ruts and a trodden verge;
//  - lakes: water, ice, murk or lava from the lake cells, with a shore ring and (lava) a glow;
//  - decor: tufts, flowers, pebbles, cracks, bones and mushrooms, all flat and small (nothing that looks like an obstacle);
//  - the existing woods and rocks keep their art (the rules block them) but gain soft baked shadows, contact shade and a light gradient;
//  - light and mood: a grade per theme, a gentle vignette, and woods that thicken past the board's edge and fade to the page's colour.
// Layer: cosmetic art tooling. Run through `npm run towercraft:board`.

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { CELL, type MapData } from '../src/map/types';
import { isArt, readPng, sheet, type Image } from './map/image';
import { FIELD_BG, FIELD_BORDER, FIELD_PX } from '../towercraft/src/fieldArt';

export const GROUND_SRC = path.join(import.meta.dirname, 'towercraftGround');

type RGB = readonly [number, number, number];

// ---------------------------------------------------------------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------------------------------------------------------------

const hash = (x: number, y: number, s: number): number => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const fade = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, s: number): number {
  const [x0, y0] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [fade(x - x0), fade(y - y0)];
  const a = hash(x0, y0, s);
  const b = hash(x0 + 1, y0, s);
  const c = hash(x0, y0 + 1, s);
  const d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Fractal noise in 0..1 (roughly bell-shaped round 0.5). x, y in noise units (features about 1 across). */
function fbm(x: number, y: number, s: number, oct = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x, y, s + o * 31);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 5.7;
    amp *= 0.5;
  }
  return sum / norm;
}
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A scalar field sampled on a coarse grid (every `step` picture pixels) and read back bilinearly. */
class Grid {
  readonly gw: number;
  readonly gh: number;
  readonly data: Float32Array;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly step: number,
    fill?: (x: number, y: number) => number,
  ) {
    this.gw = Math.ceil(w / step) + 2;
    this.gh = Math.ceil(h / step) + 2;
    this.data = new Float32Array(this.gw * this.gh);
    if (fill)
      for (let j = 0; j < this.gh; j++)
        for (let i = 0; i < this.gw; i++) this.data[j * this.gw + i] = fill(i * step, j * step);
  }
  at(x: number, y: number): number {
    const gx = Math.min(this.gw - 2.001, Math.max(0, x / this.step));
    const gy = Math.min(this.gh - 2.001, Math.max(0, y / this.step));
    const [i, j] = [Math.floor(gx), Math.floor(gy)];
    const [fx, fy] = [gx - i, gy - j];
    const o = j * this.gw + i;
    const d = this.data;
    const top = d[o]! + (d[o + 1]! - d[o]!) * fx;
    const bot = d[o + this.gw]! + (d[o + this.gw + 1]! - d[o + this.gw]!) * fx;
    return top + (bot - top) * fy;
  }
}

/** Box blur of a plane, radius r, `passes` times (three passes approximate a gaussian). */
function blur(a: Float32Array, w: number, h: number, r: number, passes = 3): void {
  const tmp = new Float32Array(Math.max(w, h));
  const run = (get: (k: number) => number, set: (k: number, v: number) => void, n: number) => {
    let sum = 0;
    const win = 2 * r + 1;
    for (let k = -r; k <= r; k++) sum += get(Math.min(n - 1, Math.max(0, k)));
    for (let k = 0; k < n; k++) {
      tmp[k] = sum / win;
      sum += get(Math.min(n - 1, k + r + 1)) - get(Math.max(0, k - r));
    }
    for (let k = 0; k < n; k++) set(k, tmp[k]!);
  };
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++)
      run(
        (k) => a[y * w + k]!,
        (k, v) => void (a[y * w + k] = v),
        w,
      );
    for (let x = 0; x < w; x++)
      run(
        (k) => a[k * w + x]!,
        (k, v) => void (a[k * w + x] = v),
        h,
      );
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Wyrmsun tiles
// ---------------------------------------------------------------------------------------------------------------------------------

/** A tile's grain: its luminance with the mean removed, softened a touch and scaled to unit spread; 32 x 32, wraps. */
class Grain {
  readonly px = new Float32Array(32 * 32);
  constructor(file: string) {
    const img = readPng(path.join(GROUND_SRC, `${file}.png`));
    const lum = new Float32Array(32 * 32);
    for (let i = 0; i < 1024; i++)
      lum[i] = 0.3 * img.data[i * 4]! + 0.59 * img.data[i * 4 + 1]! + 0.11 * img.data[i * 4 + 2]!;
    const soft = new Float32Array(1024);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            s +=
              lum[((y + dy + 32) & 31) * 32 + ((x + dx + 32) & 31)]! *
              (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1);
        soft[y * 32 + x] = s / 16;
      }
    let mean = 0;
    for (const v of soft) mean += v;
    mean /= 1024;
    let varr = 0;
    for (const v of soft) varr += (v - mean) ** 2;
    const sd = Math.sqrt(varr / 1024) || 1;
    for (let i = 0; i < 1024; i++) this.px[i] = (soft[i]! - mean) / sd;
  }
  private bil(u: number, v: number): number {
    const [x0, y0] = [Math.floor(u), Math.floor(v)];
    const [fx, fy] = [u - x0, v - y0];
    const g = (x: number, y: number) => this.px[(y & 31) * 32 + (x & 31)]!;
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  }
  /** Unit-spread grain at a picture pixel, from three copies turned and scaled differently (so no 32 px grid shows). */
  at(x: number, y: number): number {
    const a = this.bil(x, y);
    const b = this.bil(0.866 * x - 0.5 * y + 11, 0.5 * x + 0.866 * y + 7);
    const c = this.bil((0.34 * x + 0.94 * y) / 1.45 + 3, (-0.94 * x + 0.34 * y) / 1.45 + 19);
    return (a + b + c) * 0.577;
  }
}
const grains = new Map<string, Grain>();
const grain = (name: string) => {
  let g = grains.get(name);
  if (!g) grains.set(name, (g = new Grain(name)));
  return g;
};

/** A small sprite from the ground folder (RGBA), optionally smoothed up by `k`. */
const sprites = new Map<string, Image>();
function decor(name: string, k = 1): Image {
  const key = `${name}@${k}`;
  let img = sprites.get(key);
  if (!img) {
    const src = readPng(path.join(GROUND_SRC, `${name}.png`));
    if (k === 1) img = src;
    else {
      const [w, h] = [Math.round(src.width * k), Math.round(src.height * k)];
      img = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // bilinear on premultiplied colour
          const [u, v] = [(x + 0.5) / k - 0.5, (y + 0.5) / k - 0.5];
          const [x0, y0] = [Math.floor(u), Math.floor(v)];
          const [fx, fy] = [u - x0, v - y0];
          const acc = [0, 0, 0, 0];
          for (const [dx, dy, wgt] of [
            [0, 0, (1 - fx) * (1 - fy)],
            [1, 0, fx * (1 - fy)],
            [0, 1, (1 - fx) * fy],
            [1, 1, fx * fy],
          ] as const) {
            const sx = Math.min(src.width - 1, Math.max(0, x0 + dx));
            const sy = Math.min(src.height - 1, Math.max(0, y0 + dy));
            const i = (sy * src.width + sx) * 4;
            const al = src.data[i + 3]! / 255;
            acc[0]! += src.data[i]! * al * wgt;
            acc[1]! += src.data[i + 1]! * al * wgt;
            acc[2]! += src.data[i + 2]! * al * wgt;
            acc[3]! += al * wgt;
          }
          const o = (y * w + x) * 4;
          const al = acc[3]!;
          img.data[o] = al ? Math.round(acc[0]! / al) : 0;
          img.data[o + 1] = al ? Math.round(acc[1]! / al) : 0;
          img.data[o + 2] = al ? Math.round(acc[2]! / al) : 0;
          img.data[o + 3] = Math.round(al * 255);
        }
    }
    sprites.set(key, img);
  }
  return img;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------------------------------------------------------------

/** One kind of ground: its colour, the Wyrmsun tile whose grain it wears and how strongly. */
interface Mat {
  rgb: RGB;
  grain: string;
  amp: number;
}
/** A ground laid in organic patches over what is below it. */
interface Patch {
  mat: Mat;
  /** Noise feature size in picture px, the noise value above which the patch shows (higher: fewer), the softness of its edge. */
  scale: number;
  at: number;
  soft: number;
  seed: number;
  /** Cells it keeps off the road (the road's own verge is its own). */
  rim?: number;
}
type WaterKind = 'water' | 'ice' | 'murk' | 'lava';
interface Look {
  base: Mat;
  patches: Patch[];
  road: { rgb: RGB; light: RGB; dark: RGB; verge: RGB; grain: string };
  water: { kind: WaterKind; shallow: RGB; deep: RGB; shore: RGB; wet: RGB };
  /** Shadow colour multiplier and strength; the light's colour and the overall tint. */
  shadow: RGB;
  shadowK: number;
  tint: RGB;
  sat: number;
  contrast: number;
  /** The woods' underlay past the board's edge. */
  canopy: { dark: RGB; light: RGB };
  /** Lit sprites: how much brighter the tops are than the feet. */
  lift: number;
  decor: (c: Ctx) => void;
}

const m = (rgb: RGB, grainName: string, amp: number): Mat => ({ rgb, grain: grainName, amp });

// ---------------------------------------------------------------------------------------------------------------------------------
// The canvas the pieces draw on
// ---------------------------------------------------------------------------------------------------------------------------------

interface Ctx {
  W: number;
  H: number;
  B: number;
  /** Board size in picture px. */
  bw: number;
  bh: number;
  rgb: Float32Array;
  look: Look;
  seed: number;
  /** How much each pixel is road / water (0..1), from the grids, for decor to keep clear of. */
  roadA: (x: number, y: number) => number;
  waterA: (x: number, y: number) => number;
  /** Distance to the nearest road centreline, in cells. */
  roadD: (x: number, y: number) => number;
  castleD: (x: number, y: number) => number;
  rnd: () => number;
}

const lcg = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};

/** Blend a colour into the canvas at one pixel. */
function put(c: Ctx, x: number, y: number, col: RGB, a: number): void {
  if (a <= 0 || x < 0 || y < 0 || x >= c.W || y >= c.H) return;
  const i = (y * c.W + x) * 3;
  const d = c.rgb;
  d[i] = d[i]! + (col[0] - d[i]!) * a;
  d[i + 1] = d[i + 1]! + (col[1] - d[i + 1]!) * a;
  d[i + 2] = d[i + 2]! + (col[2] - d[i + 2]!) * a;
}
/** A soft round dab (radius in px, anti-aliased edge). */
function dab(c: Ctx, cx: number, cy: number, r: number, col: RGB, a: number, ry = r): void {
  const R = Math.ceil(Math.max(r, ry) + 1);
  for (let y = Math.floor(cy) - R; y <= Math.floor(cy) + R; y++)
    for (let x = Math.floor(cx) - R; x <= Math.floor(cx) + R; x++) {
      const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
      const k = clamp01((1 - d) * Math.min(r, ry) + 0.5);
      if (k > 0) put(c, x, y, col, a * k);
    }
}
/** An anti-aliased stroke. */
function stroke(c: Ctx, x0: number, y0: number, x1: number, y1: number, wd: number, col: RGB, a: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const [x, y] = [mix(x0, x1, t), mix(y0, y1, t)];
    dab(c, x, y, wd / 2, col, a * (1 - 0.5 * Math.abs(t - 0.5) * 2 * 0.5), wd / 2);
  }
}
const shade = (col: RGB, k: number): RGB => [col[0] * k, col[1] * k, col[2] * k];
const lerpC = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Scatter `count` spots (per 1000 x 1000 px) over the board where `ok` allows; `draw` paints each. */
function scatter(
  c: Ctx,
  perMega: number,
  ok: (x: number, y: number) => boolean,
  draw: (x: number, y: number) => void,
): void {
  const n = Math.round(((c.bw * c.bh) / 1e6) * perMega);
  for (let k = 0; k < n; k++) {
    const x = c.B + Math.floor(c.rnd() * c.bw);
    const y = c.B + Math.floor(c.rnd() * c.bh);
    if (ok(x, y)) draw(x, y);
    else c.rnd(); // keep the stream steady
  }
}
const freeGround =
  (c: Ctx, margin = 0.04) =>
  (x: number, y: number) =>
    c.roadA(x, y) < margin && c.waterA(x, y) < margin;
/** Free of the road by at least `cells` (so nothing flat reads as part of it) and not in water. */
const offRoad = (c: Ctx, cells: number) => (x: number, y: number) => c.roadD(x, y) > cells && c.waterA(x, y) < 0.02;

/** Blades: a short fan of curved strokes. */
function tuft(c: Ctx, x: number, y: number, col: RGB, len: number, a = 0.5): void {
  const n = 3 + Math.floor(c.rnd() * 3);
  for (let k = 0; k < n; k++) {
    const ang = -Math.PI / 2 + (c.rnd() - 0.5) * 1.5;
    const l = len * (0.6 + 0.6 * c.rnd());
    stroke(c, x + (k - n / 2) * 0.9, y, x + (k - n / 2) * 0.9 + Math.cos(ang) * l, y + Math.sin(ang) * l, 1.1, col, a);
  }
}
/** A lit pebble (a little darker underneath, lighter on the top left) with a soft shadow. */
function pebble(c: Ctx, x: number, y: number, r: number, col: RGB): void {
  dab(c, x + r * 0.5, y + r * 0.6, r * 1.05, [0, 0, 0], 0.22, r * 0.7);
  dab(c, x, y, r, shade(col, 0.82), 0.95, r * 0.78);
  dab(c, x - r * 0.2, y - r * 0.25, r * 0.7, shade(col, 1.12), 0.8, r * 0.5);
}
/** A sprite from the ground folder drawn flat onto the canvas (lit by the theme's grade later). */
function stamp(c: Ctx, name: string, cx: number, cy: number, k: number, flip = false, a = 1, shadowA = 0.25): void {
  const img = decor(name, k);
  const [ox, oy] = [Math.round(cx - img.width / 2), Math.round(cy - img.height / 2)];
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const sx = flip ? img.width - 1 - x : x;
        const i = (y * img.width + sx) * 4;
        const al = img.data[i + 3]! / 255;
        if (al < 0.05) continue;
        if (pass === 0) put(c, ox + x + 3, oy + y + 4, [0, 0, 0], al * shadowA);
        else put(c, ox + x, oy + y, [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!], al * a);
      }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------------------------------------------------------------

/** Per-theme decor: flat, small, non-blocking. The ids of the board tool's themes map onto these looks. */
const LOOKS: Record<string, Look> = {
  greenwood: {
    base: m([98, 138, 60], 'grass', 0.07),
    patches: [
      { mat: m([70, 112, 52], 'grass', 0.07), scale: 420, at: 0.56, soft: 0.07, seed: 3 },
      { mat: m([126, 152, 64], 'semi_dry_grass', 0.06), scale: 300, at: 0.6, soft: 0.07, seed: 5 },
      { mat: m([138, 110, 72], 'dirt', 0.07), scale: 340, at: 0.66, soft: 0.05, seed: 9, rim: 3 },
    ],
    road: {
      rgb: [158, 128, 88],
      light: [186, 158, 116],
      dark: [112, 88, 58],
      verge: [118, 120, 60],
      grain: 'dirt',
    },
    water: { kind: 'water', shallow: [92, 160, 168], deep: [32, 82, 108], shore: [188, 172, 124], wet: [88, 90, 60] },
    shadow: [0.5, 0.58, 0.62],
    shadowK: 0.62,
    tint: [1.03, 1.0, 0.93],
    sat: 1.08,
    contrast: 1.06,
    canopy: { dark: [22, 48, 30], light: [58, 96, 46] },
    lift: 0.14,
    decor: (c) => {
      const ok = freeGround(c);
      scatter(c, 5200, ok, (x, y) => tuft(c, x, y, shade([98, 138, 60], 0.7 + c.rnd() * 0.7), 5 + c.rnd() * 4, 0.6));
      // Meadow flowers in small clusters.
      const hues: RGB[] = [
        [244, 240, 226],
        [244, 214, 96],
        [222, 126, 150],
        [160, 150, 226],
      ];
      scatter(c, 90, offRoad(c, 1.6), (x, y) => {
        const hue = hues[Math.floor(c.rnd() * hues.length)]!;
        for (let k = 0; k < 6 + c.rnd() * 8; k++) {
          const [fx, fy] = [x + (c.rnd() - 0.5) * 34, y + (c.rnd() - 0.5) * 26];
          if (!offRoad(c, 1.4)(fx, fy)) continue;
          dab(c, fx, fy + 1, 2.4, [0, 0, 0], 0.12, 1.4);
          dab(c, fx, fy, 1.7, hue, 0.95);
          dab(c, fx, fy, 0.7, [240, 200, 70], 0.9);
        }
      });
      scatter(c, 60, offRoad(c, 2), (x, y) => pebble(c, x, y, 2 + c.rnd() * 2.5, [150, 144, 132]));
    },
  },
  frostlands: {
    base: m([224, 233, 245], 'snow', 0.035),
    patches: [
      { mat: m([190, 214, 236], 'ice', 0.04), scale: 380, at: 0.58, soft: 0.1, seed: 3 },
      { mat: m([242, 247, 253], 'snow', 0.025), scale: 260, at: 0.52, soft: 0.12, seed: 5 },
      { mat: m([170, 160, 158], 'dirt', 0.05), scale: 340, at: 0.7, soft: 0.07, seed: 9, rim: 3 },
      { mat: m([150, 160, 176], 'ice', 0.07), scale: 280, at: 0.74, soft: 0.06, seed: 13, rim: 3 },
    ],
    road: {
      rgb: [150, 124, 100],
      light: [178, 152, 124],
      dark: [104, 84, 70],
      verge: [172, 164, 164],
      grain: 'dirt',
    },
    water: {
      kind: 'ice',
      shallow: [190, 224, 244],
      deep: [112, 160, 204],
      shore: [238, 244, 252],
      wet: [150, 176, 204],
    },
    shadow: [0.5, 0.6, 0.86],
    shadowK: 0.7,
    tint: [0.96, 1.0, 1.06],
    sat: 1.0,
    contrast: 1.04,
    canopy: { dark: [24, 44, 58], light: [76, 112, 124] },
    lift: 0.1,
    decor: (c) => {
      const ok = freeGround(c);
      scatter(c, 70, offRoad(c, 2), (x, y) => pebble(c, x, y, 2 + c.rnd() * 2.5, [124, 130, 142]));
      scatter(c, 600, ok, (x, y) => tuft(c, x, y, [128, 124, 92], 4 + c.rnd() * 3, 0.5));
    },
  },
  desert: {
    base: m([216, 184, 122], 'desert_sand', 0.06),
    patches: [
      { mat: m([236, 208, 150], 'desert_sand', 0.05), scale: 460, at: 0.55, soft: 0.1, seed: 3 },
      { mat: m([178, 130, 84], 'dry_mud', 0.07), scale: 340, at: 0.62, soft: 0.05, seed: 5, rim: 3 },
      { mat: m([164, 150, 80], 'dry_grass', 0.06), scale: 300, at: 0.66, soft: 0.06, seed: 9, rim: 3 },
    ],
    road: {
      rgb: [158, 108, 70],
      light: [186, 140, 96],
      dark: [112, 74, 46],
      verge: [180, 146, 100],
      grain: 'dry_mud',
    },
    water: { kind: 'water', shallow: [96, 176, 170], deep: [30, 94, 112], shore: [236, 218, 164], wet: [160, 130, 84] },
    shadow: [0.58, 0.5, 0.52],
    shadowK: 0.6,
    tint: [1.05, 1.0, 0.92],
    sat: 1.05,
    contrast: 1.06,
    canopy: { dark: [48, 34, 22], light: [112, 88, 50] },
    lift: 0.12,
    decor: (c) => {
      const ok = freeGround(c);
      // Dune ripples.
      scatter(c, 520, ok, (x, y) => {
        const l = 14 + c.rnd() * 22;
        stroke(c, x, y, x + l, y + (c.rnd() - 0.5) * 3, 1.5, [244, 222, 168], 0.28);
        stroke(c, x + 1, y + 2.4, x + l + 1, y + 2.4, 1.2, [150, 110, 64], 0.16);
      });
      scatter(c, 520, ok, (x, y) => tuft(c, x, y, [140, 126, 66], 4 + c.rnd() * 5, 0.6));
      scatter(c, 70, offRoad(c, 2), (x, y) => pebble(c, x, y, 2 + c.rnd() * 3, [190, 166, 128]));
      scatter(c, 4, offRoad(c, 4), (x, y) =>
        stamp(c, `bones_${Math.floor(c.rnd() * 4)}`, x, y, 1.1, c.rnd() < 0.5, 0.95, 0.18),
      );
      scatter(c, 1.2, offRoad(c, 5), (x, y) =>
        stamp(c, `wyrm_${Math.floor(c.rnd() * 3) + 1}`, x, y, 1.3, c.rnd() < 0.5, 0.95, 0.2),
      );
      // Cracked earth: thin dark crack networks on the dry mud.
      scatter(c, 36, offRoad(c, 3), (x, y) => {
        let [px, py] = [x, y];
        let ang = c.rnd() * 6.28;
        for (let k = 0; k < 7; k++) {
          ang += (c.rnd() - 0.5) * 1.1;
          const l = 6 + c.rnd() * 9;
          const [nx, ny] = [px + Math.cos(ang) * l, py + Math.sin(ang) * l];
          stroke(c, px, py, nx, ny, 1.1, [86, 56, 34], 0.5);
          if (c.rnd() < 0.3)
            stroke(c, nx, ny, nx + (c.rnd() - 0.5) * 16, ny + (c.rnd() - 0.5) * 16, 0.9, [86, 56, 34], 0.4);
          [px, py] = [nx, ny];
        }
      });
    },
  },
  mire: {
    base: m([78, 70, 50], 'mud', 0.09),
    patches: [
      { mat: m([86, 110, 56], 'grass', 0.06), scale: 400, at: 0.55, soft: 0.08, seed: 3 },
      { mat: m([52, 74, 52], 'grass', 0.06), scale: 320, at: 0.6, soft: 0.07, seed: 5 },
      { mat: m([112, 100, 66], 'dry_mud', 0.06), scale: 300, at: 0.68, soft: 0.05, seed: 9, rim: 3 },
      { mat: m([58, 62, 46], 'mud', 0.08), scale: 220, at: 0.66, soft: 0.05, seed: 13, rim: 3 },
    ],
    road: {
      rgb: [134, 116, 84],
      light: [160, 142, 106],
      dark: [92, 78, 54],
      verge: [66, 60, 42],
      grain: 'dry_mud',
    },
    water: { kind: 'murk', shallow: [92, 112, 70], deep: [28, 44, 36], shore: [100, 112, 66], wet: [50, 52, 36] },
    shadow: [0.46, 0.52, 0.5],
    shadowK: 0.66,
    tint: [0.96, 1.02, 0.96],
    sat: 0.98,
    contrast: 1.07,
    canopy: { dark: [16, 30, 24], light: [48, 72, 44] },
    lift: 0.1,
    decor: (c) => {
      const ok = freeGround(c);
      scatter(c, 3200, ok, (x, y) => tuft(c, x, y, shade([76, 104, 56], 0.6 + c.rnd() * 0.7), 6 + c.rnd() * 6, 0.65));
      // Reed clumps and puddles.
      scatter(c, 140, offRoad(c, 2.4), (x, y) => {
        const r = 8 + c.rnd() * 14;
        dab(c, x, y, r, [38, 46, 34], 0.55, r * 0.5);
        dab(c, x - r * 0.15, y - r * 0.1, r * 0.8, [70, 86, 70], 0.4, r * 0.35);
      });
      scatter(c, 40, offRoad(c, 3), (x, y) =>
        stamp(c, 'fern_swamp', x, y, 0.8 + c.rnd() * 0.5, c.rnd() < 0.5, 0.95, 0.2),
      );
      scatter(c, 22, offRoad(c, 3), (x, y) =>
        stamp(c, c.rnd() < 0.5 ? 'mushroom_a' : 'mushroom_b', x, y, 0.8, false, 0.95, 0.2),
      );
      scatter(c, 3, offRoad(c, 4), (x, y) => stamp(c, 'log', x, y, 1.0, c.rnd() < 0.5, 0.95, 0.22));
      scatter(c, 50, offRoad(c, 2), (x, y) => pebble(c, x, y, 2 + c.rnd() * 2, [120, 118, 98]));
    },
  },
  ember: {
    base: m([66, 62, 64], 'dirt', 0.08),
    patches: [
      { mat: m([40, 36, 42], 'mud', 0.1), scale: 380, at: 0.52, soft: 0.08, seed: 3 },
      { mat: m([92, 62, 48], 'dry_mud', 0.07), scale: 320, at: 0.64, soft: 0.06, seed: 5, rim: 3 },
      { mat: m([84, 80, 82], 'dirt', 0.07), scale: 260, at: 0.62, soft: 0.07, seed: 9 },
    ],
    road: {
      rgb: [126, 112, 102],
      light: [152, 138, 126],
      dark: [86, 76, 70],
      verge: [48, 42, 44],
      grain: 'dirt',
    },
    water: { kind: 'lava', shallow: [255, 170, 40], deep: [200, 46, 12], shore: [58, 36, 30], wet: [36, 24, 24] },
    shadow: [0.4, 0.38, 0.46],
    shadowK: 0.72,
    tint: [1.04, 0.97, 0.96],
    sat: 1.04,
    contrast: 1.1,
    canopy: { dark: [20, 14, 16], light: [58, 40, 38] },
    lift: 0.1,
    decor: (c) => {
      const ok = freeGround(c);
      scatter(c, 1800, ok, (x, y) => {
        const r = 3 + c.rnd() * 7;
        dab(c, x, y, r, [30, 27, 30], 0.35, r * 0.6);
      });
      scatter(c, 110, offRoad(c, 2), (x, y) => pebble(c, x, y, 2 + c.rnd() * 3, [74, 68, 70]));
      scatter(c, 5, offRoad(c, 4), (x, y) =>
        stamp(c, `stalag_${Math.floor(c.rnd() * 4)}`, x, y, 1.25, c.rnd() < 0.5, 0.95, 0.25),
      );
      scatter(c, 3, offRoad(c, 5), (x, y) =>
        stamp(c, `bones_${Math.floor(c.rnd() * 4)}`, x, y, 1.1, c.rnd() < 0.5, 0.9, 0.2),
      );
      // Lava cracks: glowing seams that branch and thin out, with a faint glow round them (ground only: nothing blocks).
      scatter(c, 26, offRoad(c, 3.2), (x, y) => {
        let [px, py] = [x, y];
        let ang = c.rnd() * 6.28;
        const segs = 8 + Math.floor(c.rnd() * 8);
        for (let k = 0; k < segs; k++) {
          ang += (c.rnd() - 0.5) * 1.0;
          const l = 7 + c.rnd() * 9;
          const [nx, ny] = [px + Math.cos(ang) * l, py + Math.sin(ang) * l];
          const fadeK = 1 - k / segs;
          stroke(c, px, py, nx, ny, 5 + 3 * fadeK, [255, 90, 20], 0.12);
          stroke(c, px, py, nx, ny, 2.4 * fadeK + 0.8, [20, 10, 8], 0.8);
          stroke(c, px, py, nx, ny, 1.5 * fadeK + 0.5, [255, 150 + 60 * fadeK, 40], 0.95);
          if (c.rnd() < 0.25)
            stroke(c, nx, ny, nx + (c.rnd() - 0.5) * 22, ny + (c.rnd() - 0.5) * 22, 1, [255, 120, 30], 0.85);
          [px, py] = [nx, ny];
        }
      });
    },
  },
};
// The co-op maps wear the looks of the duels' (a map is a road network and a theme).
LOOKS.crossroads = LOOKS.greenwood!;
LOOKS.hbridge = LOOKS.desert!;
LOOKS.twinfords = LOOKS.frostlands!;
LOOKS.delta = LOOKS.ember!;

// ---------------------------------------------------------------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------------------------------------------------------------

export interface FieldInput {
  id: string;
  cols: number;
  rows: number;
  /** Road cells (row * cols + col), the lanes' centreline points (cell units) and the castles. */
  roadCells: ReadonlySet<number>;
  roadHalf: number;
  centreline: readonly (readonly [number, number])[];
  castles: readonly (readonly [number, number])[];
  /** Lake cells (row * cols + col). */
  lakeCells: ReadonlySet<number>;
  /** The zone's map data: its objects (woods, rocks, bushes) are drawn as they are, with shadows. */
  data: MapData;
}

const STEP = 4; // picture px per grid node for the coarse fields

export function paintField(inp: FieldInput): Image {
  const look = LOOKS[inp.id];
  if (!look) throw new Error(`no look for the map "${inp.id}"`);
  const B = FIELD_BORDER;
  const [bw, bh] = [inp.cols * FIELD_PX, inp.rows * FIELD_PX];
  const [W, H] = [bw + 2 * B, bh + 2 * B];
  const seed = inp.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const cellOf = (x: number, y: number) => {
    const [cx, cy] = [Math.floor((x - B) / FIELD_PX), Math.floor((y - B) / FIELD_PX)];
    return cx < 0 || cy < 0 || cx >= inp.cols || cy >= inp.rows ? -1 : cy * inp.cols + cx;
  };

  // --- Coarse fields -------------------------------------------------------------------------------------------------------
  const warpX = new Grid(W, H, STEP, (x, y) => (fbm(x / 90, y / 90, seed + 1, 2) - 0.5) * 70);
  const warpY = new Grid(W, H, STEP, (x, y) => (fbm(x / 90 + 40, y / 90, seed + 2, 2) - 0.5) * 70);
  const patchGrids = look.patches.map(
    (p) =>
      new Grid(W, H, STEP, (x, y) => {
        const [wx, wy] = [x + warpX.at(x, y) * 0.8, y + warpY.at(x, y) * 0.8];
        return fbm(wx / p.scale, wy / p.scale, seed + p.seed * 7, 3);
      }),
  );
  const tone = new Grid(W, H, STEP, (x, y) => fbm(x / 520, y / 520, seed + 21, 3));
  const warm = new Grid(W, H, STEP, (x, y) => fbm(x / 700, y / 700, seed + 22, 2));
  const fine = new Grid(W, H, 2, (x, y) => fbm(x / 22, y / 22, seed + 23, 2));

  // Cell masks blurred on the grid: the road's cells, the lakes' cells.
  const gw = Math.ceil(W / STEP) + 2;
  const gh = Math.ceil(H / STEP) + 2;
  const cellMask = (cells: ReadonlySet<number>) => {
    const a = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const ci = cellOf(i * STEP + STEP / 2, j * STEP + STEP / 2);
        if (ci >= 0 && cells.has(ci)) a[j * gw + i] = 1;
      }
    return a;
  };
  const gridOf = (a: Float32Array) => {
    const g = new Grid(W, H, STEP);
    g.data.set(a);
    return g;
  };
  const roadBlurA = cellMask(inp.roadCells);
  blur(roadBlurA, gw, gh, 2, 3);
  const roadBlur = gridOf(roadBlurA);
  const lakeA = cellMask(inp.lakeCells);
  const lakeSoftA = Float32Array.from(lakeA);
  blur(lakeA, gw, gh, 2, 3);
  blur(lakeSoftA, gw, gh, 5, 3);
  const lakeBlur = gridOf(lakeA);
  const lakeWide = gridOf(lakeSoftA);

  // Distance to the nearest centreline point (cells), found through bins of 2 x 2 cells.
  const BIN = 2;
  const bins = new Map<number, [number, number][]>();
  const binKey = (bx: number, by: number) => by * 4096 + bx;
  for (const p of inp.centreline) {
    const k = binKey(Math.floor(p[0] / BIN), Math.floor(p[1] / BIN));
    (bins.get(k) ?? bins.set(k, []).get(k)!).push([p[0], p[1]]);
  }
  const nearest = (cx: number, cy: number, reach: number) => {
    let best = reach;
    const [bx, by] = [Math.floor(cx / BIN), Math.floor(cy / BIN)];
    const span = Math.ceil(reach / BIN);
    for (let dy = -span; dy <= span; dy++)
      for (let dx = -span; dx <= span; dx++) {
        const list = bins.get(binKey(bx + dx, by + dy));
        if (list) for (const p of list) best = Math.min(best, Math.hypot(p[0] - cx, p[1] - cy));
      }
    return best;
  };
  const roadDist = new Grid(W, H, STEP, (x, y) => nearest((x - B) / FIELD_PX, (y - B) / FIELD_PX, 6));
  const castleDist = new Grid(W, H, 16, (x, y) =>
    Math.min(99, ...inp.castles.map((p) => Math.hypot(p[0] - (x - B) / FIELD_PX, p[1] - (y - B) / FIELD_PX))),
  );

  /** How road a pixel is: the smooth band round the centreline, never narrower than the road cells' own blur. */
  const R = inp.roadHalf + 0.62;
  const roadAt = (x: number, y: number): number => {
    const d = roadDist.at(x, y);
    const e = (fine.at(x, y) - 0.5) * 0.5 + (tone.at(x + 300, y) - 0.5) * 0.4;
    const shape = smooth(R + 0.14, R - 0.2, d + e * 0.9);
    const cells = smooth(0.2, 0.55, roadBlur.at(x, y) + e * 0.25);
    return Math.max(shape, cells);
  };
  /** How water a pixel is: the lake cells grown a little and given a living shoreline. */
  const waterAt = (x: number, y: number): number => {
    const e = (fine.at(x, y) - 0.5) * 0.22 + (tone.at(x + 90, y + 40) - 0.5) * 0.9;
    return smooth(0.36, 0.5, lakeBlur.at(x, y) * 0.3 + lakeWide.at(x, y) * 0.7 + e);
  };

  // --- Ground, road, water -----------------------------------------------------------------------------------------------
  const rgb = new Float32Array(W * H * 3);
  const baseGrain = grain(look.base.grain);
  const roadGrain = grain(look.road.grain);
  const patchGrains = look.patches.map((p) => grain(p.mat.grain));
  const water = look.water;
  const waterGrain = grain('shallow_water');
  const cobble = (x: number, y: number) => {
    // Gravel / flagstone cells: nearest of jittered points on a 17 px lattice.
    const [gx, gy] = [Math.floor(x / 17), Math.floor(y / 17)];
    let [d1, d2, id] = [9, 9, 0];
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const [cx, cy] = [gx + i, gy + j];
        const [px, py] = [(cx + hash(cx, cy, seed + 61)) * 17, (cy + hash(cx, cy, seed + 62)) * 17];
        const d = Math.hypot(x - px, y - py) / 17;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = hash(cx, cy, seed + 63);
        } else if (d < d2) d2 = d;
      }
    return { edge: d2 - d1, id };
  };

  const P = (x: number, y: number) => x; // (kept for symmetry with the sampling helpers)
  void P;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const tn = tone.at(x, y);
      const wm = warm.at(x, y);
      let [r, g, b]: [number, number, number] = [look.base.rgb[0], look.base.rgb[1], look.base.rgb[2]];
      const gb = baseGrain.at(x, y) * look.base.amp;
      // ground patches, each over what is below
      let rim = 0;
      let grainNow = gb;
      for (let k = 0; k < look.patches.length; k++) {
        const p = look.patches[k]!;
        const nv = patchGrids[k]!.at(x, y);
        let s = smooth(p.at - p.soft, p.at + p.soft, nv);
        if (p.rim && s > 0) s *= smooth(p.rim - 1, p.rim + 1, roadDist.at(x, y));
        if (s > 0.002) {
          rim = Math.max(rim, s * (1 - s) * 4);
          r = mix(r, p.mat.rgb[0], s);
          g = mix(g, p.mat.rgb[1], s);
          b = mix(b, p.mat.rgb[2], s);
          grainNow = mix(grainNow, patchGrains[k]!.at(x, y) * p.mat.amp, s);
        }
      }
      // large soft variation of brightness and warmth: no flat colour anywhere
      const lum = 1 + (tn - 0.5) * 0.3 + grainNow;
      r = r * lum * (1 + (wm - 0.5) * 0.08);
      g = g * lum;
      b = b * lum * (1 - (wm - 0.5) * 0.08);
      const shadeRim = 1 - 0.05 * rim;
      r *= shadeRim;
      g *= shadeRim;
      b *= shadeRim;

      const rd = roadDist.at(x, y);
      // the trodden verge
      const verge = smooth(R + 1.0, R - 0.1, rd);
      if (verge > 0) {
        const vv = verge * 0.55;
        r = mix(r, look.road.verge[0] * lum, vv * 0.5) * (1 - 0.1 * verge);
        g = mix(g, look.road.verge[1] * lum, vv * 0.5) * (1 - 0.1 * verge);
        b = mix(b, look.road.verge[2] * lum, vv * 0.5) * (1 - 0.1 * verge);
      }
      const ra = roadAt(x, y);
      if (ra > 0.002) {
        let k = 1 + roadGrain.at(x, y) * 0.05 + (tn - 0.5) * 0.22;
        // worn centre, ruts at both sides of it, patches of cobble
        const rut = Math.exp(-(((rd - 0.5) / 0.1) ** 2)) * smooth(0.3, 0.6, fbm(x / 70, y / 70, seed + 41, 2));
        const centre = smooth(0.7, 0.0, rd);
        const cb = cobble(x, y);
        const stones = smooth(0.52, 0.62, fbm(x / 160, y / 160, seed + 43, 2)) * smooth(R - 0.3, R - 0.8, rd);
        let [rr, rg, rb]: [number, number, number] = [look.road.rgb[0], look.road.rgb[1], look.road.rgb[2]];
        const lightK = centre * 0.18 + (fine.at(x, y) - 0.5) * 0.25;
        rr = mix(rr, look.road.light[0], clamp01(lightK + 0.1));
        rg = mix(rg, look.road.light[1], clamp01(lightK + 0.1));
        rb = mix(rb, look.road.light[2], clamp01(lightK + 0.1));
        const dk = rut * 0.32;
        rr = mix(rr, look.road.dark[0], dk);
        rg = mix(rg, look.road.dark[1], dk);
        rb = mix(rb, look.road.dark[2], dk);
        if (stones > 0) {
          // patches of paler packed gravel, softly mottled (no outlines)
          const mot = 0.5 + 0.5 * Math.sin(cb.id * 40) * (1 - smooth(0, 0.25, cb.edge));
          const sk = stones * 0.5;
          rr = mix(rr, look.road.light[0] * (0.9 + 0.2 * mot), sk);
          rg = mix(rg, look.road.light[1] * (0.9 + 0.2 * mot), sk);
          rb = mix(rb, look.road.light[2] * (0.9 + 0.2 * mot), sk);
        }
        // a worn lip where the road meets the ground
        const lip = smooth(R - 0.5, R, rd) * (1 - smooth(R, R + 0.15, rd));
        const edgeShade = 1 - 0.08 * lip;
        r = mix(r, rr * k * edgeShade, ra);
        g = mix(g, rg * k * edgeShade, ra);
        b = mix(b, rb * k * edgeShade, ra);
      }

      // water: a shore ring (wet, then lit), the water itself, and for lava a glow
      const lb = lakeBlur.at(x, y);
      const lw = lakeWide.at(x, y);
      if (lw > 0.02) {
        const wa = waterAt(x, y);
        // the wet bank just outside, a lighter dry rim beyond it
        const wetK = smooth(0.1, 0.3, lb) * (1 - wa);
        const dry = smooth(0.03, 0.18, lw) * (1 - smooth(0.18, 0.3, lw));
        r = mix(r, water.wet[0] * lum, wetK * 0.7);
        g = mix(g, water.wet[1] * lum, wetK * 0.7);
        b = mix(b, water.wet[2] * lum, wetK * 0.7);
        r = mix(r, water.shore[0] * (0.9 + grainNow), dry * 0.32);
        g = mix(g, water.shore[1] * (0.9 + grainNow), dry * 0.32);
        b = mix(b, water.shore[2] * (0.9 + grainNow), dry * 0.32);
        if (wa > 0.002) {
          const depth = smooth(0.35, 0.95, lw);
          const rip = fbm(x / 60 + 3, y / 14, seed + 51, 3);
          const ripple = smooth(0.58, 0.66, rip) * 0.22;
          let [wr, wg, wb]: [number, number, number] = [
            mix(water.shallow[0], water.deep[0], depth),
            mix(water.shallow[1], water.deep[1], depth),
            mix(water.shallow[2], water.deep[2], depth),
          ];
          if (water.kind === 'lava') {
            const crust = smooth(0.46, 0.7, fbm(x / 46, y / 46, seed + 52, 3) + (1 - depth) * 0.22 - 0.12);
            wr = mix(255 - 55 * depth, 38, crust);
            wg = mix(190 - 120 * depth, 22, crust);
            wb = mix(60 - 40 * depth, 22, crust);
            const rimGlow = smooth(0.0, 0.2, 1 - depth) * (1 - crust);
            wr += 20 * rimGlow;
            wg += 40 * rimGlow;
          } else if (water.kind === 'ice') {
            const crack = Math.exp(-(((fbm(x / 70, y / 70, seed + 53, 3) - 0.5) / 0.014) ** 2));
            wr = wr * (1 + roadGrain.at(x, y) * 0.01) + 20 * ripple;
            wg += 18 * ripple;
            wb += 10 * ripple;
            wr = mix(wr, 246, crack * 0.8);
            wg = mix(wg, 250, crack * 0.8);
            wb = mix(wb, 255, crack * 0.8);
          } else if (water.kind === 'murk') {
            const scum = smooth(0.5, 0.7, fbm(x / 38, y / 38, seed + 54, 3));
            wr = mix(wr, 104, scum * 0.45 * (1 - depth * 0.5)) + 12 * ripple;
            wg = mix(wg, 130, scum * 0.45 * (1 - depth * 0.5)) + 14 * ripple;
            wb = mix(wb, 72, scum * 0.45 * (1 - depth * 0.5)) + 8 * ripple;
          } else {
            wr += 70 * ripple;
            wg += 80 * ripple;
            wb += 80 * ripple;
            const sky = (1 - (y % 100000) / 100000) * 0; // placeholder: no gradient needed
            void sky;
          }
          const gr = waterGrain.at(x, y) * 0.03;
          r = mix(r, wr * (1 + gr), wa);
          g = mix(g, wg * (1 + gr), wa);
          b = mix(b, wb * (1 + gr), wa);
        }
        if (water.kind === 'lava') {
          const glow = smooth(0.02, 0.3, lw) * (1 - wa) * 0.5;
          r += 140 * glow;
          g += 56 * glow;
          b += 8 * glow;
        }
      }
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }

  const ctx: Ctx = {
    W,
    H,
    B,
    bw,
    bh,
    rgb,
    look,
    seed,
    roadA: roadAt,
    waterA: waterAt,
    roadD: (x, y) => roadDist.at(x, y),
    castleD: (x, y) => castleDist.at(x, y),
    rnd: lcg(seed ^ 0x9e3779b9),
  };
  look.decor(ctx);

  // --- Shadows and the woods ---------------------------------------------------------------------------------------------
  const objs = inp.data.objects
    .map((o, i) => ({ o, i }))
    .sort((a, b) => a.o.py + a.o.h - (b.o.py + b.o.h) || a.i - b.i)
    .map((e) => e.o);
  const scale = FIELD_PX / CELL;
  void scale; // objects are cut on the 32 px grid, as the pictures are
  const shadow = new Float32Array(W * H);
  const ao = new Float32Array(W * H);
  const sprOf = (o: (typeof objs)[number]) => sheet(inp.data.sheets[o.s]!);
  const drawShadow = (img: Image, o: (typeof objs)[number], ox: number, oy: number, flip: boolean) => {
    const tall = Math.min(1.4, o.h / 96);
    const [dx, dy] = [Math.round(o.h * 0.2), Math.round(o.h * 0.12)];
    for (let y = 0; y < o.h; y++)
      for (let x = 0; x < o.w; x++) {
        const sx = flip ? o.w - 1 - x : x;
        if (!isArt(img, o.x + sx, o.y + y)) continue;
        // the lower the part of the crown, the nearer its shadow falls to the foot
        const lift = (1 - y / o.h) * dy * 1.6;
        const [px, py] = [ox + x + Math.round(dx * (1 - (y / o.h) * 0.6)), oy + y + dy - Math.round(lift * 0.5)];
        if (px >= 0 && py >= 0 && px < W && py < H) shadow[py * W + px] = 1;
      }
    // contact shade under the foot
    const [fx, fy] = [ox + o.w / 2, oy + o.h - 4];
    const [rx, ry] = [Math.max(6, o.w * 0.34), Math.max(3, o.w * 0.14 * tall)];
    for (let y = Math.floor(fy - ry - 2); y <= Math.ceil(fy + ry + 2); y++)
      for (let x = Math.floor(fx - rx - 2); x <= Math.ceil(fx + rx + 2); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot((x - fx) / rx, (y - fy) / ry);
        if (d < 1.15) ao[y * W + x] = Math.max(ao[y * W + x]!, clamp01(1.15 - d) * 0.9);
      }
  };
  const flips = objs.map((_, i) => hash(i, 3, seed) < 0.5);
  objs.forEach((o, i) => {
    const img = sprOf(o);
    drawShadow(img, o, o.px + B, o.py + B, flips[i]!);
  });
  blur(shadow, W, H, 4, 2);
  blur(ao, W, H, 3, 2);
  const sh = look.shadow;
  for (let i = 0; i < W * H; i++) {
    const s = clamp01(shadow[i]! * 1.25) * look.shadowK + clamp01(ao[i]!) * 0.38;
    if (s <= 0.002) continue;
    const k = Math.min(0.9, s);
    rgb[i * 3] = rgb[i * 3]! * (1 - k + k * sh[0]);
    rgb[i * 3 + 1] = rgb[i * 3 + 1]! * (1 - k + k * sh[1]);
    rgb[i * 3 + 2] = rgb[i * 3 + 2]! * (1 - k + k * sh[2]);
  }

  // The woods past the board's edge: a dark canopy underlay, then the board's own trees again, thicker. Cosmetic only.
  paintBorder(ctx, objs, inp.data, flips);

  // The board's own scenery, back to front, lit from the top left.
  const lightSprite = (img: Image, o: (typeof objs)[number], ox: number, oy: number, flip: boolean) => {
    for (let y = 0; y < o.h; y++)
      for (let x = 0; x < o.w; x++) {
        const sx = flip ? o.w - 1 - x : x;
        if (!isArt(img, o.x + sx, o.y + y)) continue;
        const si = ((o.y + y) * img.width + o.x + sx) * 4;
        const [px, py] = [ox + x, oy + y];
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const t = y / o.h;
        const side = (flip ? 1 - x / o.w : x / o.w) - 0.5;
        const k = 1 + look.lift * (0.55 - t) * 1.6 - side * 0.1;
        const i = (py * W + px) * 3;
        rgb[i] = Math.min(255, img.data[si]! * k);
        rgb[i + 1] = Math.min(255, img.data[si + 1]! * k);
        rgb[i + 2] = Math.min(255, img.data[si + 2]! * k);
      }
  };
  objs.forEach((o, i) => lightSprite(sprOf(o), o, o.px + B, o.py + B, flips[i]!));

  // --- Grade, vignette, the dark beyond ---------------------------------------------------------------------------------
  const bg = FIELD_BG[inp.id] ?? 0x101010;
  const bgc: RGB = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
  const out: Image = { width: W, height: H, data: Buffer.alloc(W * H * 4) };
  const mid = 118;
  for (let y = 0; y < H; y++) {
    const by = y - B;
    for (let x = 0; x < W; x++) {
      const bx = x - B;
      const i = (y * W + x) * 3;
      let [r, g, b]: [number, number, number] = [
        rgb[i]! * look.tint[0],
        rgb[i + 1]! * look.tint[1],
        rgb[i + 2]! * look.tint[2],
      ];
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      r = l + (r - l) * look.sat;
      g = l + (g - l) * look.sat;
      b = l + (b - l) * look.sat;
      r = mid + (r - mid) * look.contrast;
      g = mid + (g - mid) * look.contrast;
      b = mid + (b - mid) * look.contrast;
      // light falls off towards the edges of the board, then everything fades to the page's colour
      const inside = Math.min(bx, bw - 1 - bx, by, bh - 1 - by);
      const outside =
        inside < 0 ? Math.hypot(Math.min(0, Math.min(bx, bw - 1 - bx)), Math.min(0, Math.min(by, bh - 1 - by))) : 0;
      const vig = inside < 0 ? 0.55 : smooth(230, 0, inside) * 0.26 + smooth(60, 0, inside) * 0.1;
      const k = 1 - vig;
      r *= k;
      g *= k;
      b *= k;
      const f = smooth(B * 0.3, B * 0.98, outside);
      r = mix(r, bgc[0], f);
      g = mix(g, bgc[1], f);
      b = mix(b, bgc[2], f);
      const o = (y * W + x) * 4;
      out.data[o] = Math.round(Math.min(255, Math.max(0, r)));
      out.data[o + 1] = Math.round(Math.min(255, Math.max(0, g)));
      out.data[o + 2] = Math.round(Math.min(255, Math.max(0, b)));
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** The woods beyond the board: a canopy of dark foliage clumps (lit on their top left), then trees (the board's own sprites, again). */
function paintBorder(c: Ctx, objs: MapData['objects'], data: MapData, flips: boolean[]): void {
  const { W, H, B, bw, bh, look } = c;
  const dist = (x: number, y: number) => {
    const [bx, by] = [x - B, y - B];
    // how far outside the playable edge (negative inside); the side woods already stand 2 cells in
    const side = Math.max(2 * FIELD_PX - bx, bx - (bw - 2 * FIELD_PX));
    const end = Math.max(-by + 10, by - bh + 10);
    return Math.max(side, end);
  };
  const dark = look.canopy.dark;
  const light = look.canopy.light;
  const rnd = lcg(c.seed ^ 0x51ed);
  // underlay: clumps drawn as overlapping dabs, darkest at the far edge
  const step = 14;
  for (let y = -step; y < H + step; y += step)
    for (let x = -step; x < W + step; x += step) {
      const [jx, jy] = [x + (rnd() - 0.5) * step * 1.4, y + (rnd() - 0.5) * step * 1.4];
      const d = dist(jx, jy);
      if (d < -20) continue;
      const cover = smooth(-20, 40, d);
      const r = 14 + rnd() * 16;
      const depth = clamp01(d / (B + 40));
      const tone = 0.4 + 0.6 * rnd();
      const col = lerpC(lerpC(dark, light, tone * (1 - depth * 0.6)), dark, depth * 0.5);
      dab(c, jx + 3, jy + 4, r, shade(dark, 0.6), 0.5 * cover, r * 0.8);
      dab(c, jx, jy, r, col, 0.95 * cover, r * 0.85);
      dab(c, jx - r * 0.25, jy - r * 0.3, r * 0.55, lerpC(col, light, 0.5), 0.45 * cover * (1 - depth * 0.7), r * 0.45);
    }
  // trees on top: pick sprites that are big (trees) from the board's objects
  const trees = objs.map((o, i) => ({ o, i })).filter((e) => e.o.h >= 64 && (e.o.tag ?? '') === 'tree');
  if (!trees.length) return;
  const placed: { x: number; y: number; e: (typeof trees)[number] }[] = [];
  const gap = 34;
  for (let y = -20; y < H + 40; y += gap)
    for (let x = -20; x < W + 20; x += gap) {
      const [jx, jy] = [x + (rnd() - 0.5) * gap * 1.2, y + (rnd() - 0.5) * gap * 1.2];
      const d = dist(jx, jy);
      if (d < 18 || jx < -20 || jy < -20 || jx > W + 20 || jy > H + 80) continue;
      placed.push({ x: jx, y: jy, e: trees[Math.floor(rnd() * trees.length)]! });
    }
  placed.sort((a, b) => a.y - b.y);
  for (const p of placed) {
    const o = p.e.o;
    const img = sheet(data.sheets[o.s]!);
    const flip = flips[p.e.i]! !== rnd() < 0.5;
    const ox = Math.round(p.x - o.w / 2);
    const oy = Math.round(p.y - o.h);
    const depth = clamp01(dist(p.x, p.y) / (B + 20));
    const dim = 1 - depth * 0.55;
    // soft shadow first (darkens what is under)
    for (let y = 0; y < o.h; y += 1)
      for (let x = 0; x < o.w; x += 1) {
        const sx = flip ? o.w - 1 - x : x;
        if (!isArt(img, o.x + sx, o.y + y)) continue;
        const [px, py] = [ox + x, oy + y];
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const si = ((o.y + y) * img.width + o.x + sx) * 4;
        const t = y / o.h;
        const k = (1 + look.lift * (0.55 - t) * 1.6) * dim;
        const i = (py * W + px) * 3;
        c.rgb[i] = Math.min(255, img.data[si]! * k);
        c.rgb[i + 1] = Math.min(255, img.data[si + 1]! * k);
        c.rgb[i + 2] = Math.min(255, img.data[si + 2]! * k);
      }
  }
}

/** Write a field picture as WebP (through sharp when it is installed, else ImageMagick's convert). */
export async function writeField(file: string, img: Image, quality = 52): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    const sharp = (await import('sharp' as string)).default as (
      input: Buffer,
      opts: { raw: { width: number; height: number; channels: 4 } },
    ) => { webp(o: object): { toFile(f: string): Promise<unknown> } };
    await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
      .webp({ quality, effort: 5, smartSubsample: true })
      .toFile(file);
  } catch {
    const png = new PNG({ width: img.width, height: img.height });
    img.data.copy(png.data);
    const tmp = `${file}.tmp.png`;
    fs.writeFileSync(tmp, PNG.sync.write(png));
    const { execFileSync } = await import('node:child_process');
    execFileSync('convert', [tmp, '-quality', String(quality), file]);
    fs.rmSync(tmp);
  }
}
