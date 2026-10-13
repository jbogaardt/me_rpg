// Sprite toolchain: packs Universal LPC art into doll sheets (src/sprites/doll.ts) for the game.
// Part catalog: sprites/parts.ts. See .claude/skills/add-sprite-part.
//
//   LPC_DIR=<clone> npm run sprites -- build [id...]   pack parts -> public/sprites/lpc/ (+ parts.json, credits.csv)
//   npm run sprites -- check                            manifest and files match the catalog (no clone needed; runs in `npm run build`)
//   npm run sprites -- preview <id>... [--anim walk|idle|cast|hurt|slash|shoot] [--out file.png] [--scale n]
//
// The LPC generator is https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator (clone it;
// LPC_DIR defaults to ../Universal-LPC-Spritesheet-Character-Generator next to this repo).

import fs from 'node:fs';
import path from 'node:path';
import { CUSTOM_PARTS, PARTS } from '../../sprites/parts';
import {
  ANIMS,
  DIR_ROW,
  DOLL_HEIGHT,
  DOLL_WIDTH,
  outfitLayers,
  type AnimName,
  type PartManifest,
} from '../../src/sprites/doll';
import { readPng, ROOT, writePng, type Image } from '../map/image';
import { Lpc, type Credit } from './lpc';

const OUT = path.join(ROOT, 'public/sprites/lpc');
const MANIFEST = path.join(OUT, 'parts.json');
const CREDITS = path.join(OUT, 'credits.csv');
const rel = (p: string) => path.relative(process.cwd(), p);

const customCredit = (id: string): Credit => {
  const part = CUSTOM_PARTS[id];
  return { file: `custom/${id}`, notes: part.notes, authors: part.authors, licenses: part.licenses, urls: part.urls };
};

/** Pack only custom (non-LPC) parts: needs no clone of the generator, and edits the manifest and credits in place. */
function buildCustom(ids: string[]) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as PartManifest;
  const rows = fs.readFileSync(CREDITS, 'utf8').trimEnd().split('\n');
  const [header = '', ...body] = rows;
  for (const id of ids) {
    const part = CUSTOM_PARTS[id];
    const file = `${id}.0.png`;
    writePng(path.join(OUT, file), readPng(path.join(ROOT, part.source)));
    manifest[id] = [{ file, z: part.z }];
    const c = customCredit(id);
    const key = csv(c.file);
    const row = [c.file, c.notes, c.authors.join(', '), c.licenses.join(', '), c.urls.join(' ')].map(csv).join(',');
    const at = body.findIndex((r) => r.startsWith(`${key},`));
    if (at >= 0) body[at] = row;
    else body.push(row);
  }
  body.sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    MANIFEST,
    JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n',
  );
  fs.writeFileSync(CREDITS, [header, ...body].join('\n') + '\n');
  console.log(`Packed ${ids.join(', ')} into ${rel(OUT)}`);
}

function build(ids: string[]) {
  if (ids.length && ids.every((id) => CUSTOM_PARTS[id])) return buildCustom(ids);
  const lpc = new Lpc(process.env.LPC_DIR ?? path.resolve(ROOT, '../Universal-LPC-Spritesheet-Character-Generator'));
  const existing: PartManifest = fs.existsSync(MANIFEST)
    ? (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as PartManifest)
    : {};
  const manifest: PartManifest = ids.length ? existing : {};
  const credits = new Map<string, Credit>();
  fs.mkdirSync(OUT, { recursive: true });
  if (!ids.length) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.rmSync(path.join(OUT, f));

  const failures: string[] = [];
  for (const id of ids.length ? ids : Object.keys(PARTS)) {
    const spec = PARTS[id];
    if (!spec) {
      if (CUSTOM_PARTS[id]) continue; // copied below
      throw new Error(`Unknown part ${id}`);
    }
    let built;
    try {
      built = lpc.build(spec);
    } catch (e) {
      failures.push(`${id}: ${(e as Error).message}`);
      continue;
    }
    manifest[id] = built.layers.map((layer, i) => {
      const file = `${id}.${i}.png`;
      writePng(path.join(OUT, file), layer.image);
      return { file, z: layer.z };
    });
    for (const c of built.credits) credits.set(c.file, c);
  }

  for (const [id, part] of Object.entries(CUSTOM_PARTS)) {
    if (ids.length && !ids.includes(id)) continue;
    const file = `${id}.0.png`;
    writePng(path.join(OUT, file), readPng(path.join(ROOT, part.source)));
    manifest[id] = [{ file, z: part.z }];
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }

  // A partial build must not drop credits of parts it did not rebuild, so credits are always recomputed in full.
  if (ids.length) {
    for (const id of Object.keys(PARTS)) for (const c of lpc.build(PARTS[id]).credits) credits.set(c.file, c);
  }
  for (const id of Object.keys(CUSTOM_PARTS)) credits.set(customCredit(id).file, customCredit(id));
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 1) + '\n');
  writeCredits(credits);
  console.log(`Packed ${Object.keys(sorted).length} parts into ${rel(OUT)}`);
}

const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
function writeCredits(credits: Map<string, Credit>) {
  const rows = [...credits.values()].sort((a, b) => a.file.localeCompare(b.file));
  const lines = ['file,notes,authors,licenses,urls'];
  for (const c of rows) {
    lines.push([c.file, c.notes, c.authors.join(', '), c.licenses.join(', '), c.urls.join(' ')].map(csv).join(','));
  }
  fs.writeFileSync(CREDITS, lines.join('\n') + '\n');
}

function check(): boolean {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`${rel(MANIFEST)} is missing: run LPC_DIR=<clone> npm run sprites -- build`);
    return false;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as PartManifest;
  const errors: string[] = [];
  for (const id of Object.keys(PARTS))
    if (!manifest[id]) errors.push(`part ${id} is in sprites/parts.ts but not packed`);
  for (const id of Object.keys(CUSTOM_PARTS))
    if (!manifest[id]) errors.push(`custom part ${id} is in sprites/parts.ts but not packed`);
  for (const [id, layers] of Object.entries(manifest)) {
    if (!PARTS[id] && !CUSTOM_PARTS[id]) errors.push(`part ${id} is packed but not in sprites/parts.ts`);
    for (const l of layers) if (!fs.existsSync(path.join(OUT, l.file))) errors.push(`${l.file} is missing`);
  }
  const used = new Set(Object.values(manifest).flatMap((ls) => ls.map((l) => l.file)));
  for (const f of fs.readdirSync(OUT))
    if (f.endsWith('.png') && !used.has(f)) errors.push(`${f} is not in the manifest`);
  for (const e of errors) console.error(e);
  if (errors.length) console.error('Rebuild with: LPC_DIR=<clone> npm run sprites -- build');
  else console.log(`Sprites OK: ${Object.keys(manifest).length} parts`);
  return !errors.length;
}

/** Alpha-over `src` onto `dst` (both RGBA, same size). */
function over(dst: Image, src: Image) {
  for (let i = 0; i < dst.data.length; i += 4) {
    const a = src.data[i + 3] / 255;
    if (!a) continue;
    const da = dst.data[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) {
      dst.data[i + c] = Math.round((src.data[i + c] * a + dst.data[i + c] * da * (1 - a)) / oa);
    }
    dst.data[i + 3] = Math.round(oa * 255);
  }
}

/** A contact sheet: each requested part list composed as one outfit, one row per direction, for a visual check. */
function preview(args: string[]) {
  const flag = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : fallback;
  };
  const anim = flag('--anim', 'walk') as AnimName;
  const out = path.resolve(flag('--out', path.join(ROOT, 'sprites/out/preview.png')));
  const scale = Number(flag('--scale', '2'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as PartManifest;
  const slotOf = (id: string) => id.split('.')[0];
  const outfit = Object.fromEntries(args.map((id) => [slotOf(id), id]));
  const layers = outfitLayers(outfit, manifest);

  const sheet = { width: DOLL_WIDTH, height: DOLL_HEIGHT, data: Buffer.alloc(DOLL_WIDTH * DOLL_HEIGHT * 4) };
  for (const l of layers) over(sheet, readPng(path.join(OUT, l.file)));
  const a = ANIMS[anim];
  const rows = a.rows === 1 ? 1 : 4;
  const w = a.cols * a.size * scale;
  const h = rows * a.size * scale;
  const img = { width: w, height: h, data: Buffer.alloc(w * h * 4, 0) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((a.y + Math.floor(y / scale)) * sheet.width + Math.floor(x / scale)) * 4;
      sheet.data.copy(img.data, (y * w + x) * 4, si, si + 4);
    }
  }
  void DIR_ROW;
  writePng(out, img);
  console.log(`Wrote ${rel(out)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'build':
    build(rest);
    break;
  case 'check':
    process.exit(check() ? 0 : 1);
    break;
  case 'preview':
    preview(rest);
    break;
  default:
    console.error('Usage: npm run sprites -- build [id...] | check | preview <id>... [--anim walk] [--out f.png]');
    process.exit(1);
}
