// Derives the frost and desert tilesets from the original Avalon art (the pack has no snow, ice or
// dead trees). Output files go to public/tilesets/ and are committed; re-run with `npm run tilesets`
// after changing a recipe. Coordinates stay identical to the source sheets, so catalog entries for
// the variants reuse the originals' x/y.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { SHADOW_RGB, SHADOW_FROST, SHADOW_DRY } from './catalog';

const dir = (f: string) => path.join(ROOT, 'public/tilesets', f);

type RGB = [number, number, number];

function toHsl([r, g, b]: RGB): [number, number, number] {
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

function fromHsl(h: number, s: number, l: number): RGB {
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

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Apply `fn` to every opaque pixel (optionally only inside `box`); `fn` returns the new colour. */
function recolor(img: Image, fn: (c: RGB) => RGB | null, box?: Box): Image {
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

const isShadow = (c: RGB) => c[0] === SHADOW_RGB[0] && c[1] === SHADOW_RGB[1] && c[2] === SHADOW_RGB[2];

// --- Frost ground: sand -> snow, teal water -> ice, grass untouched so snow blends into meadow -------------
const snow = (c: RGB): RGB | null => {
  const [h, s, l] = toHsl(c);
  // sand/dirt hues (yellow-orange); smooth falloff into the greens so the blended fringe stays natural
  const w = smooth(75, 52, h) * smooth(0.12, 0.25, s);
  if (w <= 0) return null;
  const v = 0.58 + 0.42 * clamp((l - 0.3) / 0.55); // keep the sand's noise as snow texture
  return mix(c, fromHsl(212, 0.22 + 0.2 * (1 - v), clamp(v * 0.97 + 0.04)), w);
};
const ice = (c: RGB): RGB | null => {
  const [h, s, l] = toHsl(c);
  const w = smooth(105, 130, h) * smooth(0.12, 0.3, s) * (h < 230 ? 1 : 0);
  if (w <= 0) return null;
  // Pale, frosty cyan (not pond blue), so the shore tiles match the painted ice tiles below.
  return mix(c, fromHsl(190, 0.5 - 0.2 * l, clamp(0.72 + (l - 0.2) * 0.5, 0.7, 0.9)), w);
};

// ground_plus.png = the original sheet plus a plain water tile that matches the lake ring's inner edge
// (the original solid-water tile at 480,320 is darker, which would show a seam inside wide lakes).
const plus = readPng(dir('ground_tiles.png'));
for (let y = 320; y < 352; y++) {
  for (let x = 480; x < 512; x++) {
    const n = ((((x * 7919) ^ (y * 104729)) >>> 3) % 9) - 4; // fixed pseudo-noise, no PRNG state
    const i = (y * plus.width + x) * 4;
    plus.data[i] = 47 + n;
    plus.data[i + 1] = 116 + n;
    plus.data[i + 2] = 130 + n;
    plus.data[i + 3] = 255;
  }
}
writePng(dir('ground_plus.png'), plus);
const frostGround = recolor(plus, (c) => snow(c) ?? ice(c));

// Painted ice: the solid tile the lake ring ends in, plus cracks and glints. Six variants (2 wide x 3 tall,
// see `ice` in catalog.ts) at the sheet's empty top-right corner; every mark stays clear of the tile edge so
// they tile seamlessly and the ring's inner edge still meets them.
const ICE_BASE = ice([47, 116, 130]) ?? [200, 230, 240];
const ICE_TILES: [number, number][] = [
  [608, 0],
  [640, 0],
  [608, 32],
  [640, 32],
  [608, 64],
  [640, 64],
  [608, 96], // the glare tile: two shine lines, placed by `z.glare` in the lake's corner
];
const setPx = (img: Image, x: number, y: number, c: RGB) => {
  const i = (y * img.width + x) * 4;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [
    clamp(Math.round(c[0]), 0, 255),
    clamp(Math.round(c[1]), 0, 255),
    clamp(Math.round(c[2]), 0, 255),
    255,
  ];
};
const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
ICE_TILES.forEach(([tx, ty], k) => {
  const rnd = lcg(1234 + k * 977);
  const tile = Array.from({ length: 32 }, () => Array.from({ length: 32 }, (): RGB => [0, 0, 0]));
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = ((((x * 7919 + k * 31) ^ (y * 104729)) >>> 3) % 9) - 4;
      const band = Math.sin((x + y) * 0.35 + k) * 2.5; // faint diagonal sheen
      tile[y][x] = [ICE_BASE[0] + n + band, ICE_BASE[1] + n + band, ICE_BASE[2] + n * 0.5 + band];
    }
  }
  const GLARE = k === 6;
  const put = (x: number, y: number, c: RGB) => {
    if (x >= 3 && x < 29 && y >= 3 && y < 29) tile[y][x] = c;
  };
  // Cracks: jittery walks, a dark line with a bright lip beside it, and sometimes a branch.
  const crack = (x: number, y: number, ang: number, len: number, branch: boolean) => {
    for (let i = 0; i < len; i++) {
      ang += (rnd() - 0.5) * 0.5;
      x += Math.cos(ang);
      y += Math.sin(ang);
      const [px, py] = [Math.round(x), Math.round(y)];
      put(px + 1, py, [ICE_BASE[0] + 38, ICE_BASE[1] + 24, ICE_BASE[2] + 16]);
      put(px, py, [ICE_BASE[0] - 70, ICE_BASE[1] - 52, ICE_BASE[2] - 28]);
      if (branch && i === Math.floor(len / 2))
        crack(x, y, ang + (rnd() < 0.5 ? 1 : -1) * 1.0, Math.floor(len / 2), false);
    }
  };
  for (let c = 0; c < (k === 0 || k === 3 ? 1 : 0) && !GLARE; c++)
    crack(6 + rnd() * 20, 6 + rnd() * 20, rnd() * Math.PI * 2, 14 + Math.floor(rnd() * 8), true);
  // Glints: short bright slashes.
  for (let g = 0; g < (k % 3 === 1 || GLARE ? 0 : 1); g++) {
    const [gx, gy] = [5 + Math.floor(rnd() * 20), 5 + Math.floor(rnd() * 20)];
    for (let i = 0; i < 4; i++) put(gx + i, gy - i, [244, 252, 255]);
  }
  if (GLARE) {
    // Two parallel diagonal streaks, a long one and a short one, each with a soft edge.
    for (const [x0, y0, len] of [
      [8, 22, 14],
      [18, 26, 8],
    ] as const) {
      for (let i = 0; i < len; i++) {
        put(x0 + i, y0 - i, [252, 255, 255]);
        put(x0 + i + 1, y0 - i, [214, 238, 246]);
        put(x0 + i - 1, y0 - i, [214, 238, 246]);
      }
    }
  }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setPx(frostGround, tx + x, ty + y, tile[y][x]);
});
writePng(dir('frost_ground.png'), frostGround);

// --- Tree/bush/rock sheets ------------------------------------------------------------------------------
const OBJ = readPng(dir('object-layer.png'));
const TREES_BOX: Box = { x: 30, y: 30, w: 260, h: 165 };
const ROCKS: Box[] = [
  { x: 288, y: 30, w: 32, h: 36 }, // pale boulder + pebble
  { x: 288, y: 64, w: 134, h: 34 }, // four brown rocks
];

const frostFoliage =
  (shadow: RGB) =>
  (c: RGB): RGB | null => {
    if (isShadow(c)) return shadow;
    const [h, s, l] = toHsl(c);
    if (h < 50 || h > 170 || s < 0.1) return null;
    const base = fromHsl(172 + (h - 100) * 0.25, 0.24 + s * 0.2, clamp(l * 0.95 + 0.1));
    return mix(base, [236, 245, 252], smooth(0.36, 0.56, l) * 0.88); // lit leaves wear snow
  };
const frostRock =
  (shadow: RGB) =>
  (c: RGB): RGB | null => {
    if (isShadow(c)) return shadow;
    const [, , l] = toHsl(c);
    return fromHsl(212, 0.16, clamp(l * 1.05 + 0.04));
  };

const dryFoliage =
  (shadow: RGB) =>
  (c: RGB): RGB | null => {
    if (isShadow(c)) return shadow;
    const [h, s, l] = toHsl(c);
    if (h < 50 || h > 170 || s < 0.1) return null;
    // withered scrub: ochre where lit, brown in shade
    return fromHsl(34 + (l - 0.3) * 40, 0.5 + s * 0.15, clamp(l * 0.92 + 0.02));
  };

const FROST_SHADOW: RGB = [...SHADOW_FROST];
const DRY_SHADOW: RGB = [...SHADOW_DRY];

let frost = recolor(OBJ, frostFoliage(FROST_SHADOW), TREES_BOX);
for (const box of ROCKS) frost = recolor(frost, frostRock(FROST_SHADOW), box);
writePng(dir('frost_objects.png'), frost);

writePng(dir('dry_objects.png'), recolor(OBJ, dryFoliage(DRY_SHADOW), TREES_BOX));

// --- Cliffs: the plateau art has a grass top and brown rock. Frost: snow top + blue-grey rock; dry: sand top. ------
// The lit grass is recoloured to the biome's ground tile (keeping some texture), so the plateau's walkable
// top blends with the snow/sand ground it is placed on; everything else (rock, moss) is recoloured as rock.
const CLIFFS = readPng(dir('Cliff_tileset.png'));
const SAND_BOX: Box = { x: 32, y: 160, w: 96, h: 96 }; // the plain sand tiles (snow in frost_ground)
const GRASS_BOX: Box = { x: 64, y: 384, w: 128, h: 32 }; // a clean strip of plateau grass

/** Mean colour and overall contrast (std of the green channel) of the opaque pixels in a box. */
function stats(img: Image, box: Box): { mean: RGB; std: number } {
  const sum: RGB = [0, 0, 0];
  let n = 0,
    sq = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 255) continue;
      for (let c = 0; c < 3; c++) sum[c] += img.data[i + c];
      sq += img.data[i + 1] ** 2;
      n++;
    }
  }
  const m: RGB = [sum[0] / n, sum[1] / n, sum[2] / n];
  return { mean: m, std: Math.sqrt(sq / n - m[1] ** 2) };
}

/** Plateau grass (lit): yellow-greens through teal highlights. Darker green is moss on the rock face. */
const isTop = (c: RGB) => {
  const [h, s, l] = toHsl(c);
  return h > 55 && h < 175 && s > 0.08 && l > 0.5;
};
// Move the grass to the ground's mean colour and scale its contrast towards the ground's (snow is nearly flat), so
// the fringe melts into the ground instead of showing as a lighter band.
const topToGround = (src: { mean: RGB; std: number }, dst: { mean: RGB; std: number }) => {
  const k = clamp((1.3 * dst.std) / src.std, 0.2, 0.6);
  return (c: RGB): RGB => [0, 1, 2].map((i) => dst.mean[i] + (c[i] - src.mean[i]) * k) as RGB;
};
const grassStats = stats(CLIFFS, GRASS_BOX);
const frostTop = topToGround(grassStats, stats(readPng(dir('frost_ground.png')), SAND_BOX));
const dryTop = topToGround(grassStats, stats(plus, SAND_BOX));
const dryRock = (c: RGB): RGB => {
  const [h, s, l] = toHsl(c);
  return h > 55 ? fromHsl(34 + (l - 0.3) * 40, 0.4, clamp(l * 0.95)) : fromHsl(h - 6, Math.min(1, s * 1.1), l * 0.97); // moss -> scrub
};

writePng(
  dir('frost_cliffs.png'),
  recolor(CLIFFS, (c) => (isTop(c) ? frostTop(c) : frostRock(FROST_SHADOW)(c))),
);
writePng(
  dir('dry_cliffs.png'),
  recolor(CLIFFS, (c) => (isTop(c) ? dryTop(c) : dryRock(c))),
);
console.log(
  'wrote ground_plus.png, frost_ground.png, frost_objects.png, dry_objects.png, frost_cliffs.png, dry_cliffs.png',
);
