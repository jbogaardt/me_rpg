import { Assets, Texture } from 'pixi.js';
import { DOLL_HEIGHT, DOLL_WIDTH, outfitKey, outfitLayers, outfitParts, type Outfit, type PartManifest } from './doll';

/**
 * Paper-doll compositor. Owns the part manifest and the loaded layer sheets, and turns an `Outfit` (a part per slot)
 * into one character sheet `Texture` by drawing its layers back to front. Sheets are cached per outfit, so every
 * mob of a kind (or NPC with the same look) shares one texture, and equipping gear is just asking for a new outfit.
 *
 * Layer files go through the Pixi `Assets` cache like all other art; call `load()` for the parts an outfit needs
 * before `sheet()`.
 */
export class Wardrobe {
  private sheets = new Map<string, Texture>();

  constructor(
    private manifest: PartManifest,
    /** Directory the manifest's `file` names are relative to (ends with `/`). */
    private baseUrl: string,
    /** Appended to every layer URL (a build id, so a deploy never mixes new code with cached old art). */
    private query = '',
  ) {}

  has(partId: string): boolean {
    return partId in this.manifest;
  }

  private alias(file: string) {
    return `part:${file}`;
  }

  /** Load the layer files of these part ids (skips ones already loaded). */
  async load(partIds: Iterable<string>, onProgress?: (fraction: number) => void): Promise<void> {
    const files = new Set<string>();
    for (const id of partIds) {
      const layers = this.manifest[id];
      if (!layers) throw new Error(`Unknown sprite part "${id}"`);
      for (const layer of layers) files.add(layer.file);
    }
    const todo = [...files].filter((f) => !Assets.cache.has(this.alias(f)));
    for (const f of todo) Assets.add({ alias: this.alias(f), src: this.baseUrl + f + this.query, parser: 'texture' });
    if (todo.length)
      await Assets.load(
        todo.map((f) => this.alias(f)),
        onProgress,
      );
  }

  /** The composed sheet for an outfit (doll layout, see doll.ts). All its parts must be loaded. */
  sheet(outfit: Outfit): Texture {
    const key = outfitKey(outfit);
    const cached = this.sheets.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = DOLL_WIDTH;
    canvas.height = DOLL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is unavailable, cannot compose a character sheet');
    for (const layer of outfitLayers(outfit, this.manifest)) {
      const texture = Assets.get<Texture>(this.alias(layer.file));
      if (!texture) {
        throw new Error(`Sprite layer ${layer.file} is not loaded (outfit: ${outfitParts(outfit).join(', ')})`);
      }
      ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
    }
    const texture = Texture.from(canvas);
    this.sheets.set(key, texture);
    return texture;
  }
}
