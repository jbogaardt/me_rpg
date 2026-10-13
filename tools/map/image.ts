import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { CELL, sortKey, type MapData } from '../../src/map/types';
import { SHADOWS } from './shadows';

export const ROOT = path.resolve(import.meta.dirname, '../..');

/** RGBA pixels of an image. */
export interface Image {
  width: number;
  height: number;
  data: Buffer;
}

export function readPng(file: string): Image {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
}

export function writePng(file: string, img: Image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(img));
}

/**
 * The smallest of a few lossless encodings: art with 256 colours or fewer (all of ours) becomes an indexed PNG with a
 * transparency chunk, which is several times smaller than 8-bit RGBA; anything richer stays RGBA. Fully transparent
 * pixels are stored as transparent black (their colour is invisible, and the browser drops it anyway).
 */
export function encodePng(img: Image): Buffer {
  const indexed = encodeIndexed(img);
  if (indexed) return indexed;
  const png = new PNG({ width: img.width, height: img.height, deflateLevel: 9 });
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

function encodeIndexed({ width, height, data }: Image): Buffer | null {
  const rgba = (i: number) => (data[i + 3] ? data.readUInt32BE(i) : 0);
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const c = rgba(i);
    counts.set(c, (counts.get(c) ?? 0) + 1);
    if (counts.size > 256) return null;
  }
  // Translucent colours first, so the tRNS chunk can stop at the last one; then the most used, which deflates best.
  const alpha = (c: number) => c & 0xff;
  const palette = [...counts.keys()].sort(
    (a, b) => Number(alpha(a) === 255) - Number(alpha(b) === 255) || counts.get(b)! - counts.get(a)! || a - b,
  );
  const index = new Map(palette.map((c, i) => [c, i]));
  const depth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8;
  const perByte = 8 / depth;
  const stride = Math.ceil(width / perByte);
  const raw = Buffer.alloc((stride + 1) * height); // each row: filter type 0, then packed indices
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < width; x++) {
      const i = index.get(rgba((y * width + x) * 4))!;
      raw[row + Math.floor(x / perByte)] |= i << (8 - depth * (1 + (x % perByte)));
    }
  }

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((c, i) => plte.writeUIntBE(c >>> 8, i * 3, 3));
  const translucent = palette.filter((c) => alpha(c) !== 255).length;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(depth, 8);
  header.writeUInt8(3, 9); // colour type 3: palette
  const strategies = [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED, zlib.constants.Z_RLE];
  const idat = strategies
    .map((strategy) => zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy }))
    .reduce((best, b) => (b.length < best.length ? b : best));
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('PLTE', plte),
    ...(translucent ? [chunk('tRNS', Buffer.from(palette.slice(0, translucent).map(alpha)))] : []),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export type Sheets = Map<string, Image>;

const sheetCache: Sheets = new Map();
export function sheet(name: string): Image {
  let img = sheetCache.get(name);
  if (!img) {
    const file = path.join(ROOT, 'public/tilesets', name);
    if (!fs.existsSync(file)) throw new Error(`Unknown tileset ${name} (expected ${file})`);
    img = readPng(file);
    sheetCache.set(name, img);
  }
  return img;
}

/** Is this sheet pixel solid art (opaque and not the baked-in drop shadow)? */
export function isArt(img: Image, x: number, y: number): boolean {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  if (d[i + 3] < 16) return false;
  if (d[i + 3] < 128) return false; // the LPC trees' baked shadows are translucent
  return !SHADOWS.some((c) => d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]);
}

/**
 * Per-cell fraction (0..1) covered by solid art of the given objects, optionally only counting each
 * object's bottom `band(o)` pixels. Returned row-major, width*height.
 */
export function coverage(
  data: Pick<MapData, 'width' | 'height' | 'sheets' | 'objects'>,
  band: (o: MapData['objects'][number]) => number = (o) => o.h,
): Float32Array {
  const W = data.width * CELL;
  const H = data.height * CELL;
  // One bit per world pixel (a big world is ~80M pixels): overlapping art counts once.
  const bits = new Uint8Array(Math.ceil((W * H) / 8));
  const out = new Float32Array(data.width * data.height);
  for (const o of data.objects) {
    const img = sheet(data.sheets[o.s]);
    const from = Math.max(0, o.h - band(o));
    for (let y = from; y < o.h; y++) {
      const wy = o.py + y;
      if (wy < 0 || wy >= H) continue;
      for (let x = 0; x < o.w; x++) {
        const wx = o.px + x;
        if (wx < 0 || wx >= W || !isArt(img, o.x + x, o.y + y)) continue;
        const p = wy * W + wx;
        if (bits[p >> 3] & (1 << (p & 7))) continue;
        bits[p >> 3] |= 1 << (p & 7);
        out[Math.floor(wy / CELL) * data.width + Math.floor(wx / CELL)]++;
      }
    }
  }
  return out.map((n) => n / (CELL * CELL));
}

export interface RenderOptions {
  collision?: boolean; // red overlay on blocked cells
  grid?: boolean; // cell grid, with a brighter line every 5 cells
  markers?: boolean; // spawn (green), NPC (pink), mobs (orange)
  crop?: { col: number; row: number; w: number; h: number }; // in cells
  scale?: number; // integer nearest-neighbour upscale
}

/** Composite a map the way MapView draws it: ground, then objects sorted by bottom edge. */
export function renderMap(data: MapData, opts: RenderOptions = {}): Image {
  const W = data.width * CELL;
  const H = data.height * CELL;
  const out: Image = { width: W, height: H, data: Buffer.alloc(W * H * 4) };
  for (let i = 0; i < W * H; i++) out.data.writeUInt32BE(0x1a1a2eff, i * 4); // game background
  const blit = (img: Image, sx: number, sy: number, w: number, h: number, dx: number, dy: number) => {
    for (let y = 0; y < h; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= H || sy + y >= img.height) continue;
      for (let x = 0; x < w; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= W || sx + x >= img.width) continue;
        const si = ((sy + y) * img.width + sx + x) * 4;
        if (img.data[si + 3] < 128) continue; // the art is 0/255 alpha
        img.data.copy(out.data, (ty * W + tx) * 4, si, si + 4);
      }
    }
  };
  data.ground.forEach((g, i) => {
    if (!g) return;
    for (let k = 0; k + 2 < g.length; k += 3)
      blit(
        sheet(data.sheets[g[k]]),
        g[k + 1],
        g[k + 2],
        CELL,
        CELL,
        (i % data.width) * CELL,
        Math.floor(i / data.width) * CELL,
      );
  });
  const objects = data.objects.map((o, i) => ({ o, i })).sort((a, b) => sortKey(a.o) - sortKey(b.o) || a.i - b.i);
  for (const { o } of objects) blit(sheet(data.sheets[o.s]), o.x, o.y, o.w, o.h, o.px, o.py);

  const tint = (x0: number, y0: number, w: number, h: number, rgb: number, alpha: number) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        const i = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const v = (rgb >> (16 - 8 * c)) & 255;
          out.data[i + c] = Math.round(out.data[i + c] * (1 - alpha) + v * alpha);
        }
      }
    }
  };
  if (opts.collision) {
    for (const i of data.collision)
      tint((i % data.width) * CELL, Math.floor(i / data.width) * CELL, CELL, CELL, 0xff2020, 0.45);
  }
  if (opts.grid) {
    for (let c = 0; c <= data.width; c++) tint(c * CELL, 0, 1, H, 0x000000, c % 5 === 0 ? 0.6 : 0.25);
    for (let r = 0; r <= data.height; r++) tint(0, r * CELL, W, 1, 0x000000, r % 5 === 0 ? 0.6 : 0.25);
  }
  if (opts.markers) {
    const mark = (col: number, row: number, rgb: number) => tint(col * CELL + 8, row * CELL + 8, 16, 16, rgb, 0.9);
    mark(data.spawn.col, data.spawn.row, 0x30e070);
    if (data.npc) mark(data.npc.col, data.npc.row, 0xff6b8a);
    for (const m of data.mobs) mark(m.col, m.row, 0xff9020);
    for (const c of data.chests) mark(c.col, c.row, 0xffe040);
    for (const c of data.crops) mark(c.col, c.row, 0x80e040);
    for (const sh of data.shops) mark(sh.col, sh.row, 0x40c0ff);
    for (const p of data.pets) mark(p.col, p.row, 0xc080ff);
    for (const g of data.givers) mark(g.col, g.row, 0xffffff);
    for (const s of data.sites) mark(s.col, s.row, 0x70ffe0);
  }

  let img = out;
  if (opts.crop) {
    const { col, row, w, h } = opts.crop;
    img = { width: w * CELL, height: h * CELL, data: Buffer.alloc(w * h * CELL * CELL * 4) };
    for (let y = 0; y < img.height; y++) {
      const sy = row * CELL + y;
      if (sy < 0 || sy >= H) continue;
      for (let x = 0; x < img.width; x++) {
        const sx = col * CELL + x;
        if (sx >= 0 && sx < W)
          out.data.copy(img.data, (y * img.width + x) * 4, (sy * W + sx) * 4, (sy * W + sx) * 4 + 4);
      }
    }
  }
  const k = Math.max(1, Math.floor(opts.scale ?? 1));
  if (k === 1) return img;
  const big: Image = {
    width: img.width * k,
    height: img.height * k,
    data: Buffer.alloc(img.width * img.height * k * k * 4),
  };
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const si = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      img.data.copy(big.data, (y * big.width + x) * 4, si, si + 4);
    }
  }
  return big;
}
