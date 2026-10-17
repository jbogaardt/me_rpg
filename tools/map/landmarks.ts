// Builds public/tilesets/landmarks.png and src/systems/landmarkAtlas.ts: the pixel art of the things a quest's telling
// puts in the world (a well, a wagon, a camp, a church, a bell tower...), cut and composed from two CC-BY-SA 3.0 LPC
// packs (see CREDITS.md). The packs are NOT in the repo; download and unzip
//   [LPC] Medieval Village Decorations  https://opengameart.org/sites/default/files/decoration_medieval.zip
//   [LPC] City outside                  https://opengameart.org/sites/default/files/LPC_city_outside_1.zip
// and run
//   DECOR_DIR=<dir with decorations-medieval.png> CITY_DIR=<dir with city_outside.png> npm run landmarks
// The output is committed. A piece is cut whole from its pack (the largest connected blob inside a region, so a neighbour
// at the edge does not come along); the church, the bell tower and the watchtower are composed from the City pack's stone
// wall, spire roofs, windows and doors, with a bell and a cross added pixel by pixel. No scaling, no recolour: the pieces
// are on the packs' own pixels. To change one, edit PIECES / the builders and rerun. `Landmark.ts` draws from the sheet.

import fs from 'node:fs';
import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from './image';

const OUT = path.join(ROOT, 'public/tilesets/landmarks.png');
const ATLAS = path.join(ROOT, 'src/systems/landmarkAtlas.ts');
const WIDTH = 512;

const blank = (w: number, h: number): Image => ({ width: w, height: h, data: Buffer.alloc(w * h * 4) });
const alphaAt = (img: Image, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

/** Draw `src` over `dst` at (dx, dy), pixel for pixel (alpha over for the opaque and half-opaque alike: ours are 0 or 255). */
function over(dst: Image, src: Image, dx: number, dy: number) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const si = (y * src.width + x) * 4;
      if (src.data[si + 3] === 0) continue;
      src.data.copy(dst.data, (ty * dst.width + tx) * 4, si, si + 4);
    }
}

/** The pixels of a rectangle of `img` as an image of their own. */
function crop(img: Image, x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++) {
    const si = ((y + yy) * img.width + x) * 4;
    img.data.copy(out.data, yy * w * 4, si, si + w * 4);
  }
  return out;
}

/** `img` with every pixel of the key colour made transparent (the Decorations sheet marks its blank cells in olive). */
function unkey(img: Image, key: [number, number, number]): Image {
  const out = { ...img, data: Buffer.from(img.data) };
  for (let i = 0; i < out.data.length; i += 4)
    if (out.data[i] === key[0] && out.data[i + 1] === key[1] && out.data[i + 2] === key[2]) out.data[i + 3] = 0;
  return out;
}

/** The largest connected blob of opaque pixels (8-way) inside a region, cut to its bounding box; the rest is dropped. */
function blob(img: Image, x0: number, y0: number, w: number, h: number): Image {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || alphaAt(img, x0 + (i % w), y0 + Math.floor(i / w)) === 0) continue;
    const cells: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const cx = c % w;
      const cy = Math.floor(c / w);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
          if (alphaAt(img, x0 + nx, y0 + ny) === 0) continue;
          seen[ny * w + nx] = 1;
          stack.push(ny * w + nx);
        }
    }
    if (cells.length > best.length) best = cells;
  }
  if (!best.length) throw new Error(`no art in region ${x0},${y0} ${w}x${h}`);
  const xs = best.map((c) => c % w);
  const ys = best.map((c) => Math.floor(c / w));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out = blank(maxX - minX + 1, maxY - minY + 1);
  for (const c of best) {
    const sx = x0 + (c % w);
    const sy = y0 + Math.floor(c / w);
    img.data.copy(
      out.data,
      ((Math.floor(c / w) - minY) * out.width + (c % w) - minX) * 4,
      (sy * img.width + sx) * 4,
      (sy * img.width + sx) * 4 + 4,
    );
  }
  return out;
}

/** A pixel picture drawn from rows of characters: `.` is clear, other characters look up `palette`. */
function drawn(rows: string[], palette: Record<string, [number, number, number]>): Image {
  const out = blank(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = palette[ch];
      if (!c) return;
      out.data.set([c[0], c[1], c[2], 255], (y * out.width + x) * 4);
    }),
  );
  return out;
}

/** `piece` tiled across `w` x `h` (the piece's own repeat). */
function tiled(piece: Image, w: number, h: number): Image {
  const out = blank(w, h);
  for (let y = 0; y < h; y += piece.height) for (let x = 0; x < w; x += piece.width) over(out, piece, x, y);
  return out;
}

const BELL = drawn(
  [
    '....oo....',
    '...oggo...',
    '..oggggo..',
    '..ogGggo..',
    '..oggggo..',
    '.oggggggo.',
    '.ogGggggo.',
    'oggggggggo',
    'oooooooooo',
    '...odko...',
  ],
  { o: [92, 58, 20], g: [214, 160, 52], G: [250, 214, 110], d: [92, 58, 20], k: [60, 38, 14] },
);

const CROSS = drawn(['..cc..', '..cc..', 'cccccc', 'cccccc', '..cc..', '..cc..', '..cc..', '..cc..'], {
  c: [196, 190, 176],
});

/** Dark opening of a belfry or an arrow slit, with an arched head. */
function opening(w: number, h: number): Image {
  const out = blank(w, h);
  const edge: [number, number, number] = [46, 40, 52];
  const fill: [number, number, number] = [26, 20, 34];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = w / 2;
      const inArch = y >= r || Math.hypot(x + 0.5 - r, y + 0.5 - r) <= r;
      if (!inArch) continue;
      const border = x === 0 || x === w - 1 || y === 0 || (y < r && Math.hypot(x + 0.5 - r, y + 0.5 - r) > r - 1.3);
      out.data.set([...(border ? edge : fill), 255], (y * w + x) * 4);
    }
  return out;
}

interface Built {
  name: string;
  img: Image;
}

function build(decor: Image, city: Image): Built[] {
  const d = unkey(decor, [129, 161, 0]);
  const wall = crop(city, 448, 300, 32, 72); // stone brick body (repeats every 32 px)
  const cap = crop(city, 448, 288, 96, 11); // cracked stone cap
  const plinth = tiled(crop(city, 448, 372, 32, 8), 160, 8);
  const slate = blob(city, 446, 204, 68, 84);
  const red = blob(city, 512, 204, 63, 84);
  const archedWindow = blob(city, 576, 76, 32, 50);
  const slit = blob(city, 640, 0, 36, 60); // a small framed window
  const door = blob(city, 703, 14, 36, 54); // the plain wooden door
  const doorway = blob(city, 574, 133, 36, 62); // a dark doorway in a stone frame
  const gable = (() => {
    const g = blob(city, 0, 226, 164, 164);
    // the roof's neighbour, a loose gable end, hangs at its top right
    for (let y = 0; y < 34; y++) for (let x = 126; x < g.width; x++) g.data[(y * g.width + x) * 4 + 3] = 0;
    // the little lamp the pack hangs in the notch is not wanted on a church
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        const i = (y * g.width + x) * 4;
        const [r, gg, b] = [g.data[i], g.data[i + 1], g.data[i + 2]];
        if (r > 200 && gg > 190 && b > 150) g.data[i + 3] = 0;
      }
    return g;
  })();

  /** A stone tower: brick shaft, cap and plinth, a spire on top, and the given openings. */
  function tower(roof: Image, shaftH: number, extras: (img: Image, w: number, top: number) => void): Image {
    const w = 64;
    const top = roof.height - 6;
    const img = blank(w + 2, top + shaftH + 12);
    over(img, tiled(wall, w, shaftH), 1, top);
    over(img, crop(cap, 0, 0, w, 11), 1, top);
    over(img, crop(plinth, 0, 0, w, 8), 1, top + shaftH + 4);
    over(img, roof, Math.floor((img.width - roof.width) / 2), 0);
    extras(img, w, top);
    return img;
  }

  const watch = tower(red, 88, (img, w, top) => {
    over(img, slit, 1 + Math.floor((w - slit.width) / 2), top + 16);
    over(img, doorway, 1 + Math.floor((w - doorway.width) / 2), top + 88 + 12 - doorway.height + 4);
  });
  const bellTower = tower(slate, 104, (img, w, top) => {
    const arch = opening(22, 34);
    over(img, arch, 1 + Math.floor((w - arch.width) / 2), top + 12);
    over(img, BELL, 1 + Math.floor((w - BELL.width) / 2), top + 24);
    over(img, door, 1 + Math.floor((w - door.width) / 2), top + 104 + 12 - door.height + 3);
  });

  // The church: a slate-roofed nave with a double door and arched windows, the bell tower beside it.
  const nave = (() => {
    const w = gable.width;
    const wallTop = 70;
    const wallH = 104;
    const img = blank(w, gable.height + 18);
    over(img, tiled(wall, w - 16, wallH), 8, wallTop);
    over(img, crop(plinth, 0, 0, w - 16, 8), 8, wallTop + wallH);
    over(img, gable, 0, 0);
    over(img, CROSS, Math.floor((w - CROSS.width) / 2), 0);
    const baseY = wallTop + wallH;
    over(img, door, Math.floor((w - door.width) / 2) - 4, baseY - door.height + 2);
    over(img, door, Math.floor((w - door.width) / 2) + door.width - 6, baseY - door.height + 2);
    for (const x of [20, w - 20 - archedWindow.width]) over(img, archedWindow, x, baseY - archedWindow.height - 20);
    return img;
  })();
  const church = (() => {
    const img = blank(nave.width + bellTower.width - 18, Math.max(nave.height, bellTower.height));
    over(img, bellTower, nave.width - 18, img.height - bellTower.height);
    over(img, nave, 0, img.height - nave.height);
    return img;
  })();

  return [
    { name: 'well', img: blob(d, 443, 405, 66, 115) },
    { name: 'cart', img: blob(d, 185, 500, 100, 80) },
    { name: 'tent', img: blob(d, 5, 1616, 196, 140) },
    { name: 'hut', img: blob(d, 351, 351, 70, 74) },
    ...[0, 1, 2].map((i) => ({ name: `fire${i}`, img: blob(d, 255 + i * 32, 1476, 32, 92) })),
    { name: 'shrine', img: blob(city, 606, 126, 36, 68) },
    { name: 'tower', img: watch },
    { name: 'belltower', img: bellTower },
    { name: 'church', img: church },
  ];
}

function main() {
  const decorDir = process.env.DECOR_DIR;
  const cityDir = process.env.CITY_DIR;
  if (!decorDir || !cityDir)
    throw new Error('set DECOR_DIR and CITY_DIR to the unzipped packs (see the header of this file)');
  const pieces = build(
    readPng(path.join(decorDir, 'decorations-medieval.png')),
    readPng(path.join(cityDir, 'city_outside.png')),
  );
  // Shelf packing, tallest first, a pixel of air so nothing bleeds when scaled by the GPU.
  const order = [...pieces].sort((a, b) => b.img.height - a.img.height);
  const placed = new Map<string, { x: number; y: number }>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const p of order) {
    if (x + p.img.width > WIDTH) {
      x = 0;
      y += rowH + 2;
      rowH = 0;
    }
    placed.set(p.name, { x, y });
    x += p.img.width + 2;
    rowH = Math.max(rowH, p.img.height);
  }
  const sheet = blank(WIDTH, y + rowH);
  for (const p of pieces) over(sheet, p.img, placed.get(p.name)!.x, placed.get(p.name)!.y);
  writePng(OUT, sheet);
  const rows = pieces.map((p) => {
    const at = placed.get(p.name)!;
    return `  ${p.name}: { x: ${at.x}, y: ${at.y}, w: ${p.img.width}, h: ${p.img.height} },`;
  });
  fs.writeFileSync(
    ATLAS,
    `// Generated by tools/map/landmarks.ts (\`npm run landmarks\`): where each landmark's pixel art sits on\n// public/tilesets/landmarks.png (\`entities/Landmark.ts\` draws from it). Do not edit by hand.\n\nexport const LANDMARK_ATLAS = {\n${rows.join('\n')}\n} as const;\n\nexport const LANDMARK_SHEET = { width: ${WIDTH}, height: ${sheet.height} } as const;\n`,
  );
  console.log(`landmarks: ${pieces.length} pieces on a ${WIDTH}x${sheet.height} sheet`);
}

main();
