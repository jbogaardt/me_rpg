import { Texture } from 'pixi.js';
import { DOLL_HEIGHT, DOLL_WIDTH, outfitKey, outfitLayers, outfitParts, type Outfit, type PartManifest } from './doll';
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
        const img = new Image();
        img.src = this.url(file);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Sprite layer ${file} failed to load`));
        });
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
