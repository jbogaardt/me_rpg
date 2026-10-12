// Derives the frost and desert tilesets from the original Avalon art (the pack has no snow, ice or
// dead trees). Output files go to public/tilesets/ and are committed; re-run with `npm run tilesets`
// after changing a recipe. Coordinates stay identical to the source sheets, so catalog entries for
// the variants reuse the originals' x/y.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { clamp, fromHsl, mix, recolor, smooth, toHsl, type Box, type RGB } from './color';
import { SHADOW_RGB, SHADOW_FROST } from './shadows';

const dir = (f: string) => path.join(ROOT, 'public/tilesets', f);

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

// --- Rock sheet for the frost lands (trees and bushes come from the LPC trees pack, see trees.ts) ---------------
const OBJ = readPng(dir('object-layer.png'));
const ROCKS: Box[] = [
  { x: 288, y: 30, w: 32, h: 36 }, // pale boulder + pebble
  { x: 288, y: 64, w: 134, h: 34 }, // four brown rocks
];

const frostRock =
  (shadow: RGB) =>
  (c: RGB): RGB | null => {
    if (isShadow(c)) return shadow;
    const [, , l] = toHsl(c);
    return fromHsl(212, 0.16, clamp(l * 1.05 + 0.04));
  };

const FROST_SHADOW: RGB = [...SHADOW_FROST];

let frost = OBJ;
for (const box of ROCKS) frost = recolor(frost, frostRock(FROST_SHADOW), box);
writePng(dir('frost_objects.png'), frost);

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
// --- Swamp water: the LPC atlas's soft-banked pond, recoloured murky olive (the brown bank stays) ------------------------
// Water terrain tiles sit at columns 27-29, rows 0-5 of the atlas (see Terrain.tsx); the plain tile below them is deep water.
const SWAMP_BOX: Box = { x: 27 * 32, y: 0, w: 3 * 32, h: 6 * 32 };
const murk = (c: RGB): RGB | null => {
  const [h, s, l] = toHsl(c);
  if (h < 160 || h > 220 || s < 0.25) return null; // only the blue-cyan water, not the earthy bank
  return fromHsl(150 + (h - 190) * 0.25, clamp(0.28 + s * 0.15, 0, 0.5), clamp(l * 0.86, 0.14, 0.5)); // green-teal, still water
};
writePng(dir('lpc_swamp.png'), recolor(readPng(dir('lpc_terrain.png')), murk, SWAMP_BOX));

console.log(
  'wrote lpc_swamp.png, ground_plus.png, frost_ground.png, frost_objects.png, frost_cliffs.png, dry_cliffs.png',
);
