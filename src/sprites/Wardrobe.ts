import { Texture } from 'pixi.js';
import {
  DOLL_HEIGHT,
  DOLL_WIDTH,
  frameRect,
  outfitKey,
  outfitLayers,
  outfitParts,
  type Outfit,
  type PartManifest,
} from './doll';
import { RefCache } from './sheetCache';

/** Unused character sheets kept for reuse (each is about 5 MB of canvas plus 5 MB on the GPU). */
const SPARE_SHEETS = 4;

/** The wardrobe that made each sheet, so a `Character` can give its sheet back without knowing the wardrobe. */
const owners = new WeakMap<Texture, Wardrobe>();

/** Give back a sheet from `Wardrobe.sheet` (a Character does this when it swaps sheets or is destroyed). */
export function releaseSheet(sheet: Texture) {
  owners.get(sheet)?.release(sheet);
}

/**
 * Paper-doll compositor. Owns the part manifest and the loaded layer images, and turns an `Outfit` (a part per slot)
 * into one character sheet `Texture` by drawing its layers back to front. Sheets are shared per outfit, so every mob
 * of a kind (or NPC with the same look) uses one texture, and equipping gear is just asking for a new outfit.
 *
 * Every `sheet()` call takes a reference that must be given back (`releaseSheet`); `Character` does that for you. A
 * sheet nobody uses is kept as one of a few spares, then destroyed, so gear changes in a long co-op game don't pile up
 * textures.
 *
 * Layers are plain `<img>` elements rather than Pixi textures: they are only ever drawn onto a canvas here, never
 * rendered, and the browser may drop an image's decoded pixels while it is unused and decode it again on the next
 * draw. (An `ImageBitmap`, Pixi's default, stays decoded: 5 MB per layer, over 600 MB for every part at boot.) This is
 * the one place that loads art outside the Pixi `Assets` cache. Call `load()` for the parts an outfit needs before
 * `sheet()`.
 */
/** Fetch one layer image, trying again a couple of times: a hiccup (a busy network, a deploy replacing files) must not stop the game from starting. */
async function loadImage(url: string, file: string, tries = 3): Promise<HTMLImageElement> {
  for (let attempt = 1; ; attempt++) {
    const img = new Image();
    img.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Sprite layer ${file} failed to load`));
      });
      return img;
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

export class Wardrobe {
  private images = new Map<string, HTMLImageElement>();
  private sheets = new RefCache<Texture>(SPARE_SHEETS, (sheet) => {
    const canvas = sheet.source.resource as HTMLCanvasElement;
    sheet.destroy(true);
    canvas.width = canvas.height = 0; // free the backing store now rather than at the next GC
  });

  constructor(
    private manifest: PartManifest,
    /** The URL of a layer file named in the manifest. */
    private url: (file: string) => string,
  ) {}

  has(partId: string): boolean {
    return partId in this.manifest;
  }

  /** Load the layer files of these part ids (skips ones already loaded). */
  async load(partIds: Iterable<string>, onProgress?: (fraction: number) => void): Promise<void> {
    const files = new Set<string>();
    for (const id of partIds) {
      const layers = this.manifest[id];
      if (!layers) throw new Error(`Unknown sprite part "${id}"`);
      for (const layer of layers) if (!this.images.has(layer.file)) files.add(layer.file);
    }
    let done = 0;
    await Promise.all(
      [...files].map(async (file) => {
        const img = await loadImage(this.url(file), file);
        this.images.set(file, img);
        onProgress?.(++done / files.size);
      }),
    );
  }

  /**
   * The composed sheet for an outfit (doll layout, see doll.ts), with a reference taken on it: give it back with
   * `releaseSheet` (a `Character` does). All its parts must be loaded.
   */
  sheet(outfit: Outfit): Texture {
    const sheet = this.sheets.acquire(outfitKey(outfit), () => this.compose(outfit));
    owners.set(sheet, this);
    return sheet;
  }

  private portraits = new Map<string, string>();

  /**
   * A picture of what an outfit looks like (the idle frame facing the player, enlarged), as an image URL for the HTML
   * screens, such as the quest page showing what to hunt. Made once per outfit.
   */
  portrait(outfit: Outfit): string {
    const key = outfitKey(outfit);
    const known = this.portraits.get(key);
    if (known) return known;
    const { x, y, w, h } = frameRect('idle', 'down', 0);
    const out = document.createElement('canvas');
    out.width = w * 3;
    out.height = h * 3;
    const ctx = out.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      // Drawn from the part layers themselves, not read back from the composed sheet's texture: a texture's canvas is
      // the GPU's to keep, and some browsers hand back something drawImage refuses.
      for (const layer of outfitLayers(outfit, this.manifest)) {
        const img = this.images.get(layer.file);
        if (img) ctx.drawImage(img, x, y, w, h, 0, 0, out.width, out.height);
      }
    }
    const url = out.toDataURL();
    this.portraits.set(key, url);
    return url;
  }

  release(sheet: Texture) {
    this.sheets.release(sheet);
  }

  private compose(outfit: Outfit): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = DOLL_WIDTH;
    canvas.height = DOLL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is unavailable, cannot compose a character sheet');
    for (const layer of outfitLayers(outfit, this.manifest)) {
      const img = this.images.get(layer.file);
      if (!img) throw new Error(`Sprite layer ${layer.file} is not loaded (outfit: ${outfitParts(outfit).join(', ')})`);
      ctx.drawImage(img, 0, 0);
    }
    return Texture.from(canvas, true); // skip the global cache: the RefCache owns sheets
  }
}
