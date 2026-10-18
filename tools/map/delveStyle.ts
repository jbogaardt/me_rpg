// How a cave or sewer is dressed beyond its flat ground tiles (Pixi-free, tested): which floor variant a cell shows, which
// shading, foam and detail tile goes over it. `delve.ts` asks here while painting; `delveFx.ts` draws the sheet these
// coordinates point into (`public/tilesets/delve_fx.png`, 16 columns of 32 px cells). Everything is a pure function of the
// cell and its neighbours, so a map is the same on every build and on every page. Visual only (core engine, no rules).

/** The overlay sheet (see `delveFx.ts`). */
export const FX_SHEET = 'delve_fx.png';
export const FX_CELL = 32;

/** Fixed pseudo-noise in 0..1 from a cell (no PRNG state, so a map is the same every build). */
export function hash(col: number, row: number, seed = 0) {
  let h = Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663) ^ Math.imul(seed + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Which sides of a cell have a given neighbour: a 4-bit mask, N=1 E=2 S=4 W=8. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const maskOf = (n: boolean, e: boolean, s: boolean, w: boolean) =>
  (n ? N : 0) | (e ? E : 0) | (s ? S : 0) | (w ? W : 0);

type XY = readonly [number, number];
const at = (col: number, row: number): XY => [col * FX_CELL, row * FX_CELL];

/** Rows of the overlay sheet. */
const ROW = { shadow: 0, foam: 1, decal: 2, roof: 3, rim: 4 } as const;

/** The soft contact shadow on a cell's edges (a wall's foot, a side wall): one tile per side mask 1..15. */
export const shadowTile = (mask: number): XY => at(mask, ROW.shadow);
/** The foam where water meets floor: one tile per side mask 1..15. */
export const foamTile = (mask: number): XY => at(mask, ROW.foam);
/** The light edge of rock roof against open ground: one tile per side mask 1..15. */
export const rimTile = (mask: number): XY => at(mask, ROW.rim);

/** Floor details and how many drawn variants of each (columns of the decal row, in this order). */
export const DECALS = [
  { kind: 'puddle', count: 4 },
  { kind: 'crack', count: 3 },
  { kind: 'moss', count: 3 },
  { kind: 'pebbles', count: 3 },
  { kind: 'stain', count: 3 },
] as const;
export type DecalKind = (typeof DECALS)[number]['kind'];
export const DECAL_COLUMNS = DECALS.reduce((n, d) => n + d.count, 0);
/** Variants of the roof's rock texture. */
export const ROOF_VARIANTS = 6;

export function decalTile(kind: DecalKind, variant: number): XY {
  let col = 0;
  for (const d of DECALS) {
    if (d.kind === kind) return at(col + (variant % d.count), ROW.decal);
    col += d.count;
  }
  throw new Error(`no decal ${kind}`);
}
export const roofTile = (variant: number): XY => at(variant % ROOF_VARIANTS, ROW.roof);

/** Share of floor cells carrying a detail, and the mix of kinds, as cumulative weights (a wet theme has more puddles). */
export interface DecalMix {
  share: number;
  kinds: readonly [DecalKind, number][];
}
export const WET_MIX: DecalMix = {
  share: 0.3,
  kinds: [
    ['puddle', 3],
    ['stain', 2],
    ['crack', 2],
    ['moss', 2],
    ['pebbles', 1],
  ],
};
export const DRY_MIX: DecalMix = {
  share: 0.22,
  kinds: [
    ['crack', 3],
    ['pebbles', 3],
    ['stain', 2],
    ['moss', 1],
    ['puddle', 1],
  ],
};

/** The detail a floor cell shows, or null. `h` is a 0..1 hash of the cell; the same value picks the variant. */
export function pickDecal(mix: DecalMix, h: number, h2: number): { kind: DecalKind; variant: number } | null {
  if (h >= mix.share) return null;
  const total = mix.kinds.reduce((n, [, w]) => n + w, 0);
  let t = (h / mix.share) * total;
  for (const [kind, w] of mix.kinds) {
    if (t < w) return { kind, variant: Math.floor(h2 * 8) };
    t -= w;
  }
  return null;
}

/** Which of `weights.length` floor variants a cell shows: `h` in 0..1 walks the cumulative weights. */
export function pickWeighted(weights: readonly number[], h: number): number {
  const total = weights.reduce((n, w) => n + w, 0);
  let t = h * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i] ?? 0;
    if (t < 0) return i;
  }
  return weights.length - 1;
}

/** Edge shading by distance in pixels from a lit edge (0 = at the edge): dark at the foot, fading in four stepped bands. */
export const SHADE_BANDS: readonly [number, number][] = [
  [2, 0.56],
  [5, 0.4],
  [8, 0.24],
  [12, 0.1],
];
export function shadeAt(distance: number): number {
  for (const [reach, alpha] of SHADE_BANDS) if (distance < reach) return alpha;
  return 0;
}

/** 2x2 ordered-dither threshold (0..1) for a pixel: pixel-art softening between stepped alphas. */
export const BAYER2 = [
  [0.125, 0.625],
  [0.875, 0.375],
] as const;
export const bayer = (x: number, y: number) => BAYER2[y & 1][x & 1];
