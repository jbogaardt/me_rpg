// Reads the Universal LPC Spritesheet Character Generator's data (a local clone of
// https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) and turns one catalog entry
// into packed "doll sheet" layers (see src/sprites/doll.ts).

import fs from 'node:fs';
import path from 'node:path';
import { ANIMS, DOLL_HEIGHT, DOLL_WIDTH, type AnimName } from '../../src/sprites/doll';
import { type Image } from '../map/image';
import { PNG } from 'pngjs';

export type BodyType = 'male' | 'female' | 'teen' | 'child' | 'muscular';

/** One thing to build: a sheet definition (path under sheet_definitions/, no .json) worn by a body type. */
export interface PartSpec {
  item: string;
  body: BodyType;
  /** A recolour (palette entry, e.g. `blonde`, `steel`, `brown`) or, for pre-coloured items, the variant file. */
  color?: string;
  /** Second colour group when the item has one (human heads: eye colour). */
  color2?: string;
}

export interface Credit {
  file: string;
  notes: string;
  authors: string[];
  licenses: string[];
  urls: string[];
}

export interface BuiltLayer {
  z: number;
  image: Image;
}

export interface BuiltPart {
  layers: BuiltLayer[];
  credits: Credit[];
}

interface LayerDef {
  zPos: number;
  custom_animation?: string;
  [bodyType: string]: string | number | undefined;
}

interface ItemDef {
  name: string;
  variants?: string[];
  animations?: string[];
  recolors?: Record<string, unknown>;
  credits?: Credit[];
  [layer: string]: unknown;
}

type Palette = Record<string, string[]>;
interface RecolorGroup {
  material: string;
  base?: string;
}

/** The recolour groups of an item definition, in order. */
function recolorGroups(def: ItemDef): RecolorGroup[] {
  const r = def.recolors;
  if (!r) return [];
  if (typeof r.material === 'string') return [r as unknown as RecolorGroup];
  return Object.keys(r)
    .filter((k) => /^color_\d+$/.test(k))
    .sort()
    .map((k) => r[k] as RecolorGroup);
}

// The generator's own names for the animations we pack, and the file/folder each is stored under.
const SOURCE_ANIM: Record<AnimName, string> = {
  walk: 'walk',
  idle: 'idle',
  cast: 'spellcast',
  hurt: 'hurt',
  slash: 'slash',
};

export class Lpc {
  private defs = new Map<string, ItemDef>();
  private palettes = new Map<string, Palette>();
  private meta = new Map<string, { base: string }>();
  private images = new Map<string, Image | null>();

  /** `root` is the generator clone. */
  constructor(readonly root: string) {
    if (!fs.existsSync(path.join(root, 'sheet_definitions'))) {
      throw new Error(
        `LPC generator not found at ${root}. Clone https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator ` +
          `and point LPC_DIR at it (e.g. LPC_DIR=../lpc npm run sprites -- build).`,
      );
    }
  }

  private def(item: string): ItemDef {
    let def = this.defs.get(item);
    if (!def) {
      const file = path.join(this.root, 'sheet_definitions', `${item}.json`);
      if (!fs.existsSync(file)) throw new Error(`No LPC sheet definition ${item}`);
      def = JSON.parse(fs.readFileSync(file, 'utf8')) as ItemDef;
      this.defs.set(item, def);
    }
    return def;
  }

  private palette(material: string): Palette {
    let p = this.palettes.get(material);
    if (!p) {
      p = JSON.parse(
        fs.readFileSync(path.join(this.root, 'palette_definitions', material, `${material}_ulpc.json`), 'utf8'),
      ) as Palette;
      this.palettes.set(material, p);
    }
    return p;
  }

  private materialBase(material: string): string {
    let m = this.meta.get(material);
    if (!m) {
      m = JSON.parse(
        fs.readFileSync(path.join(this.root, 'palette_definitions', material, `meta_${material}.json`), 'utf8'),
      ) as { base: string };
      this.meta.set(material, m);
    }
    return m.base;
  }

  /** A source PNG under spritesheets/, or null if it does not exist. Cached (many parts share a body). */
  private image(rel: string): Image | null {
    if (this.images.has(rel)) return this.images.get(rel) ?? null;
    const file = path.join(this.root, 'spritesheets', rel);
    let img: Image | null = null;
    if (fs.existsSync(file)) {
      const png = PNG.sync.read(fs.readFileSync(file));
      img = { width: png.width, height: png.height, data: png.data };
    }
    this.images.set(rel, img);
    return img;
  }

  /** Recolour in place: every pixel matching a `from` colour (within 1 per channel, like the generator) becomes `to`. */
  private recolor(img: Image, from: string[], to: string[]): Image {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const pairs = from.map((f, i) => ({ f: rgb(f), t: rgb(to[i] ?? f) }));
    const out = Buffer.from(img.data);
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      for (const { f, t } of pairs) {
        if (Math.abs(out[i] - f[0]) <= 1 && Math.abs(out[i + 1] - f[1]) <= 1 && Math.abs(out[i + 2] - f[2]) <= 1) {
          out[i] = t[0];
          out[i + 1] = t[1];
          out[i + 2] = t[2];
          break;
        }
      }
    }
    return { width: img.width, height: img.height, data: out };
  }

  build(spec: PartSpec): BuiltPart {
    const def = this.def(spec.item);
    const where = `${spec.item} (${spec.body}${spec.color ? `, ${spec.color}` : ''})`;
    const layers: BuiltLayer[] = [];
    const usedPaths: string[] = [];

    // Recolour, if this item is recoloured rather than shipped pre-coloured. One group (`material`) or several
    // (`color_1`, `color_2`, e.g. human heads: skin then eyes), matched in order by `color` and `color2`.
    const variants = def.variants ?? [];
    const color = spec.color ?? (variants.length === 1 ? variants[0] : undefined);
    const groups = recolorGroups(def);
    const steps: ((img: Image) => Image)[] = [];
    for (const [i, group] of groups.entries()) {
      const to = i === 0 ? color : spec.color2;
      if (!to) continue;
      const palette = this.palette(group.material);
      const baseName = (group.base ?? this.materialBase(group.material)).replace(/^ulpc\./, '');
      const from = palette[baseName];
      const target = palette[to];
      if (!from) throw new Error(`${where}: base palette "${baseName}" missing from ${group.material}`);
      if (!target) throw new Error(`${where}: no "${to}" in ${group.material} (${Object.keys(palette).join(', ')})`);
      steps.push((img) => this.recolor(img, from, target));
    }
    const recolor = steps.length ? (img: Image) => steps.reduce((acc, step) => step(acc), img) : null;
    const isVariant = variants.length > 0;
    if (isVariant && (!color || !variants.includes(color)))
      throw new Error(`${where}: variants are ${variants.join(', ')}`);
    spec = { ...spec, color };

    for (const key of Object.keys(def).filter((k) => /^layer_\d+$/.test(k))) {
      const layer = def[key] as LayerDef;
      const dir = layer[spec.body];
      if (typeof dir !== 'string') continue; // this layer does not exist for this body type
      const custom = layer.custom_animation;
      if (custom !== undefined && custom !== 'slash_128') continue; // other attack styles are not packed
      usedPaths.push(dir);

      const out = new Sheet(DOLL_WIDTH, DOLL_HEIGHT);
      let any = false;
      if (custom === 'slash_128') {
        // A weapon swing: already 128px frames in slash layout (6 columns x 4 rows).
        const src = this.source(dir, 'slash', true, spec.color, isVariant);
        if (src) {
          out.blit(recolor ? recolor(src) : src, 0, ANIMS.slash.y);
          any = true;
        }
      } else {
        const done = new Set<AnimName>();
        let walk: Image | null = null;
        for (const anim of Object.keys(ANIMS) as AnimName[]) {
          const src = this.source(dir, anim, false, spec.color, isVariant);
          if (!src) continue;
          const img = recolor ? recolor(src) : src;
          // The 64px slash of a body layer sits in the middle of the 128px swing frames.
          if (anim === 'slash') out.blitFrames(img, 64, ANIMS.slash.size, ANIMS.slash.y, 4);
          else out.blit(img, 0, ANIMS[anim].y);
          if (anim === 'walk') walk = img;
          done.add(anim);
          any = true;
        }
        // Older LPC items have no idle art; the standing pose is the first walk frame (both idle frames use it).
        if (walk && !done.has('idle')) {
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < ANIMS.idle.cols; col++) {
              out.copyRect(walk, 0, row * 64, 64, 64, col * 64, ANIMS.idle.y + row * 64);
            }
          }
        }
      }
      if (any) layers.push({ z: layer.zPos, image: out.image });
    }
    if (!layers.length) throw new Error(`${where}: no art found for this body type`);

    return { layers, credits: this.credits(def, usedPaths) };
  }

  /** The source sheet for one animation of one layer directory. */
  private source(
    dir: string,
    anim: AnimName,
    attack: boolean,
    color: string | undefined,
    variant: boolean,
  ): Image | null {
    const file = (color ?? '').replace(/ /g, '_'); // the generator stores "dark brown" as dark_brown.png
    if (attack) return this.image(`${dir}${variant ? file : 'slash'}.png`);
    const name = SOURCE_ANIM[anim];
    return this.image(variant ? `${dir}${name}/${file}.png` : `${dir}${name}.png`);
  }

  private credits(def: ItemDef, usedPaths: string[]): Credit[] {
    return (def.credits ?? []).filter((c) => usedPaths.some((p) => p.startsWith(c.file.replace(/\/?$/, '/'))));
  }
}

/** A blank RGBA canvas with the few blit operations the packer needs. */
class Sheet {
  readonly image: Image;
  constructor(width: number, height: number) {
    this.image = { width, height, data: Buffer.alloc(width * height * 4) };
  }

  /** Copy all of `src` to (x, y). */
  blit(src: Image, x: number, y: number) {
    this.copy(src, 0, 0, src.width, src.height, x, y);
  }

  /** Copy `rows` rows of `srcSize`-px frames into `destSize`-px frames, centred. */
  blitFrames(src: Image, srcSize: number, destSize: number, y: number, rows: number) {
    const offset = (destSize - srcSize) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < Math.floor(src.width / srcSize); c++) {
        this.copy(src, c * srcSize, r * srcSize, srcSize, srcSize, c * destSize + offset, y + r * destSize + offset);
      }
    }
  }

  copyRect(src: Image, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
    this.copy(src, sx, sy, w, h, dx, dy);
  }

  private copy(src: Image, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
    const dst = this.image;
    for (let y = 0; y < h; y++) {
      if (sy + y >= src.height || dy + y < 0 || dy + y >= dst.height) continue;
      for (let x = 0; x < w; x++) {
        if (sx + x >= src.width || dx + x < 0 || dx + x >= dst.width) continue;
        const si = ((sy + y) * src.width + sx + x) * 4;
        const di = ((dy + y) * dst.width + dx + x) * 4;
        src.data.copy(dst.data, di, si, si + 4);
      }
    }
  }
}
