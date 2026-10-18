// Builds the tree and bush sheets (public/tilesets/trees_<kind>.png) and their atlas (treeAtlas.ts) from the
// LPC trees pack in art/lpc_trees/ ("[LPC] Trees Mega-Pack", CC-BY-SA 3.0, see CREDITS.md). Run by
// `npm run tilesets`; outputs are committed. Every sprite is cut out by its own shape (so a neighbouring tree
// on the pack's sheet never bleeds in), keeps its baked translucent shadow, and the picks are packed side by
// side. `frost` and `swamp` are recolours of the green sheet; `autumn` is the pack's orange sheet.

import fs from 'node:fs';
import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';
import { clamp, fromHsl, mix, recolor, smooth, toHsl, type RGB } from './color';
import { TREE_PICKS, TREE_KINDS, type TreeKind } from './treePicks';

const art = (f: string) => path.join(ROOT, 'art/lpc_trees', f);
const out = (f: string) => path.join(ROOT, 'public/tilesets', f);

const ART_ALPHA = 100; // below this a pixel is shadow, not tree
const MERGE = 3; // art pixels this close belong to one tree (leaf specks, thin branches)
const GAP = 2;
const SOLID_SHARE = 0.75; // the bottom share of a sprite that blocks: trunk and most of the crown; the top is walk-behind
const SHEET_W = 512;

/** For every pixel of a source sheet: which sprite (connected piece of art, shadow included) it belongs to. */
function label(img: Image): Int32Array {
  const { width: W, height: H, data } = img;
  const art = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) art[i] = (data[i * 4 + 3] ?? 0) >= ART_ALPHA ? 1 : 0;
  const near = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (art[y * W + x])
        for (let dy = -MERGE; dy <= MERGE; dy++)
          for (let dx = -MERGE; dx <= MERGE; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1;
          }
  const lab = new Int32Array(W * H);
  let n = 0;
  for (let s = 0; s < W * H; s++) {
    if (!near[s] || lab[s]) continue;
    lab[s] = ++n;
    const stack = [s];
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W,
        y = (p / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (near[q] && !lab[q]) {
          lab[q] = n;
          stack.push(q);
        }
      }
    }
  }
  // Shadow pixels (translucent) join the sprite whose art is nearest.
  const owner = new Int32Array(W * H);
  let front: number[] = [];
  for (let i = 0; i < W * H; i++)
    if (art[i]) {
      owner[i] = lab[i]!;
      front.push(i);
    }
  while (front.length) {
    const next: number[] = [];
    for (const p of front) {
      const x = p % W,
        y = (p / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (!owner[q] && (data[q * 4 + 3] ?? 0) > 0) {
          owner[q] = owner[p]!;
          next.push(q);
        }
      }
    }
    front = next;
  }
  return owner;
}

interface Cut {
  w: number;
  h: number;
  px: number[]; // RGBA, w*h*4
}

/** Cut the sprite in `rect` out of the sheet: the biggest piece of art in it, plus pieces at least a third as big. */
function cut(img: Image, owner: Int32Array, rect: readonly [number, number, number, number]): Cut {
  const [rx, ry, rw, rh] = rect;
  const counts = new Map<number, number>();
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++) {
      const o = owner[y * img.width + x];
      if (o && (img.data[(y * img.width + x) * 4 + 3] ?? 0) >= ART_ALPHA) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
  const best = Math.max(0, ...counts.values());
  if (!best) throw new Error(`no art in ${rect.join(',')}`);
  const keep = new Set([...counts].filter(([, n]) => n >= best / 3).map(([o]) => o));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  const mine = (x: number, y: number) =>
    keep.has(owner[y * img.width + x]) && (img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0;
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++)
      if (mine(x, y)) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1;
  const px = new Array<number>(w * h * 4).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mine(x0 + x, y0 + y))
        for (let c = 0; c < 4; c++) px[(y * w + x) * 4 + c] = img.data[((y0 + y) * img.width + x0 + x) * 4 + c]!;
  return { w, h, px };
}

export interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bottom pixels that block (the rest is walk-behind). */
  band: number;
}

/** Shelf-pack cuts into a sheet; returns the image and where each went. */
function pack(cuts: { cut: Cut }[]): { sheet: Image; placed: Placed[] } {
  const placed: Placed[] = [];
  let x = 0,
    y = 0,
    rowH = 0;
  for (const { cut } of cuts) {
    if (x + cut.w > SHEET_W) [x, y, rowH] = [0, y + rowH + GAP, 0];
    placed.push({ x, y, w: cut.w, h: cut.h, band: Math.round(cut.h * SOLID_SHARE) });
    x += cut.w + GAP;
    rowH = Math.max(rowH, cut.h);
  }
  const H = y + rowH;
  const sheet: Image = { width: SHEET_W, height: H, data: Buffer.alloc(SHEET_W * H * 4) };
  cuts.forEach(({ cut }, i) => {
    const p = placed[i];
    for (let yy = 0; yy < cut.h; yy++)
      for (let xx = 0; xx < cut.w; xx++)
        for (let c = 0; c < 4; c++)
          sheet.data[((p.y + yy) * SHEET_W + p.x + xx) * 4 + c] = cut.px[(yy * cut.w + xx) * 4 + c]!;
  });
  return { sheet, placed };
}

// --- Recolours of the green sheet --------------------------------------------------------------------------
const leafOnly =
  (fn: (h: number, s: number, l: number) => RGB) =>
  (c: RGB): RGB | null => {
    const [h, s, l] = toHsl(c);
    if (h < 50 || h > 170 || s < 0.1) return null;
    return fn(h, s, l);
  };
const frostLeaves = leafOnly((h, s, l) => {
  const base = fromHsl(172 + (h - 100) * 0.25, 0.24 + s * 0.2, clamp(l * 0.95 + 0.1));
  return mix(base, [236, 245, 252], smooth(0.17, 0.3, l) * 0.9); // lit leaves wear snow
});
const swampLeaves = leafOnly((h, s, l) => fromHsl(78 + (h - 100) * 0.2, 0.2 + s * 0.15, clamp(l * 0.74)));

const SOURCE: Record<Exclude<TreeKind, 'frost' | 'swamp'>, string> = {
  green: 'trees-green.png',
  dry: 'trees-brown.png',
  jungle: 'trees-pale.png',
  autumn: 'trees-orange.png',
  dead: 'trees-dead.png',
};

const atlas: Record<string, { trees: Placed[]; bushes: Placed[] }> = {};
const sheets = new Map<TreeKind, Image>();
for (const kind of Object.keys(SOURCE) as (keyof typeof SOURCE)[]) {
  const img = readPng(art(SOURCE[kind]));
  const owner = label(img);
  const picks = TREE_PICKS[kind];
  const all = [...picks.trees, ...picks.bushes].map((p) => ({ cut: cut(img, owner, p.rect), band: 0 }));
  const { sheet, placed } = pack(all);
  sheets.set(kind, sheet);
  atlas[kind] = { trees: placed.slice(0, picks.trees.length), bushes: placed.slice(picks.trees.length) };
}
for (const [kind, fn] of [
  ['frost', frostLeaves],
  ['swamp', swampLeaves],
] as const) {
  sheets.set(kind, recolor(sheets.get('green')!, fn));
  atlas[kind] = atlas.green!;
}
for (const kind of TREE_KINDS) writePng(out(`trees_${kind}.png`), sheets.get(kind)!);

const body = JSON.stringify(atlas, null, 2).replace(/"(\w+)":/g, '$1:');
fs.writeFileSync(
  path.join(ROOT, 'tools/map/treeAtlas.ts'),
  `// Generated by tools/map/trees.ts (\`npm run tilesets\`): where each tree and bush sits on public/tilesets/trees_<kind>.png.\n// Do not edit by hand.\n\nexport interface TreeSprite {\n  x: number;\n  y: number;\n  w: number;\n  h: number;\n  band: number;\n}\nexport const TREE_ATLAS: Record<string, { trees: TreeSprite[]; bushes: TreeSprite[] }> = ${body};\n`,
);
console.log('wrote trees_*.png and treeAtlas.ts');
