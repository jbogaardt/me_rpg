import { Container, Sprite, Texture } from 'pixi.js';
import { makeFrame } from '../core/textures';
import { DARK_SCALE, darknessAlpha } from './darkness';
import { CELL, sortKey, type MapData } from './types';

/**
 * Renders a MapData as two layers inside one render group (so the camera moving or zooming it is a single GPU
 * transform):
 *  - `ground`: the 32px ground cells. It never changes, so it is its own render group and its draw list is
 *    built once instead of every frame.
 *  - `layer`: map objects (trees, rocks...) plus whatever the scene adds (characters, effects). Children are
 *    y-sorted by `zIndex`; the scene sets `zIndex` to a character's feet y so it sorts with the objects.
 *    Map objects are cullable, so ones off screen aren't drawn.
 * (tools/map/image.ts draws the same way in Node for map previews.)
 */
export class MapView extends Container {
  readonly ground = new Container({ isRenderGroup: true });
  readonly layer = new Container({ sortableChildren: true });
  private frames = new Map<string, Texture | null>();

  constructor(
    readonly data: MapData,
    private textures: Map<string, Texture>,
  ) {
    super({ isRenderGroup: true });
    this.ground.cullableChildren = false; // static and cheap to draw; not worth a per-frame bounds check
    this.addChild(this.ground, this.layer);

    data.ground.forEach((cell, i) => {
      if (!cell) return;
      const [s, x, y] = cell;
      const texture = this.frame(s, x, y, CELL, CELL);
      if (!texture) return;
      const sprite = new Sprite(texture);
      sprite.position.set((i % data.width) * CELL, Math.floor(i / data.width) * CELL);
      this.ground.addChild(sprite);
    });

    for (const o of data.objects) {
      const texture = this.frame(o.s, o.x, o.y, o.w, o.h);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.position.set(o.px, o.py);
      sprite.zIndex = sortKey(o);
      sprite.cullable = true;
      this.layer.addChild(sprite);
    }
    this.addDarkness();
    this.frames.clear(); // only needed while building; the sprites keep their textures
  }

  /**
   * The edge of the world: a black fade over the open ground that is solid black in the unwalkable cells. A few pixels per
   * cell, stretched with linear filtering (the only texture here that is not nearest) so the fade is smooth. It sits
   * above everything, so a character darkens as it nears the edge.
   */
  private addDarkness() {
    const alpha = darknessAlpha(this.data);
    if (!alpha) return;
    const width = this.data.width * DARK_SCALE,
      height = this.data.height * DARK_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    alpha.forEach((a, i) => {
      img.data.set([11, 13, 28, Math.round(a * 255)], i * 4);
    });
    ctx.putImageData(img, 0, 0);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'linear';
    const sprite = new Sprite(texture);
    sprite.scale.set(CELL / DARK_SCALE);
    sprite.zIndex = 1e9;
    this.layer.addChild(sprite);
  }

  private frame(s: number, x: number, y: number, w: number, h: number): Texture | null {
    const key = `${s}:${x}:${y}:${w}:${h}`;
    if (!this.frames.has(key)) {
      const name = this.data.sheets[s];
      const sheet = name ? this.textures.get(name) : undefined;
      this.frames.set(key, sheet ? makeFrame(sheet, x, y, w, h) : null);
    }
    return this.frames.get(key) ?? null;
  }
}
