import { Container, Sprite, type Texture } from 'pixi.js';
import { makeFrame } from '../core/textures';
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
      // A cell is one or more [sheet, x, y] layers, bottom first.
      for (let k = 0; k + 2 < cell.length; k += 3) {
        const texture = this.frame(cell[k]!, cell[k + 1]!, cell[k + 2]!, CELL, CELL);
        if (!texture) continue;
        const sprite = new Sprite(texture);
        sprite.position.set((i % data.width) * CELL, Math.floor(i / data.width) * CELL);
        this.ground.addChild(sprite);
      }
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
    this.frames.clear(); // only needed while building; the sprites keep their textures
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
