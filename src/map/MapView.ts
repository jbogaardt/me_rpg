import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { CELL, type GroundCell, type MapData, type MapObject } from './types';

/** A sub-rectangle of a sheet as its own texture, clamped to the image. Null if fully outside. */
export function makeFrame(sheet: Texture, x: number, y: number, w: number, h: number): Texture | null {
  w = Math.min(w, sheet.width - x);
  h = Math.min(h, sheet.height - y);
  if (w <= 0 || h <= 0) return null;
  return new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });
}

/**
 * Renders a MapData: a ground layer plus y-sorted objects. The game adds its own entities as
 * children and sets their zIndex to their feet y so they sort with the objects.
 * (tools/map/image.ts draws the same way in Node for map previews.)
 */
export class MapView extends Container {
  private ground = new Container();
  private groundSprites: (Sprite | null)[] = [];
  private objectSprites = new Map<MapObject, Sprite>();
  private frames = new Map<string, Texture | null>();

  constructor(
    public data: MapData,
    private textures: Map<string, Texture>,
  ) {
    super();
    this.sortableChildren = true;
    this.ground.zIndex = -1e9;
    this.addChild(this.ground);
    this.rebuild(data);
  }

  private frame(s: number, x: number, y: number, w: number, h: number): Texture | null {
    const key = `${s}:${x}:${y}:${w}:${h}`;
    if (!this.frames.has(key)) {
      const sheet = this.textures.get(this.data.sheets[s]);
      this.frames.set(key, sheet ? makeFrame(sheet, x, y, w, h) : null);
    }
    return this.frames.get(key) ?? null;
  }

  rebuild(data: MapData = this.data) {
    this.data = data;
    this.frames.clear();
    this.ground.removeChildren().forEach((c) => c.destroy());
    this.objectSprites.forEach((sp) => sp.destroy());
    this.objectSprites.clear();
    this.groundSprites = new Array(data.width * data.height).fill(null);
    data.ground.forEach((cell, i) => cell && this.drawGround(i, cell));
    data.objects.forEach((o) => this.drawObject(o));
  }

  setGround(col: number, row: number, cell: GroundCell | null) {
    const i = row * this.data.width + col;
    this.groundSprites[i]?.destroy();
    this.groundSprites[i] = null;
    this.data.ground[i] = cell;
    if (cell) this.drawGround(i, cell);
  }

  addObject(o: MapObject) {
    this.data.objects.push(o);
    this.drawObject(o);
  }

  removeObject(o: MapObject) {
    const i = this.data.objects.indexOf(o);
    if (i >= 0) this.data.objects.splice(i, 1);
    this.objectSprites.get(o)?.destroy();
    this.objectSprites.delete(o);
  }

  private drawGround(i: number, [s, x, y]: GroundCell) {
    const texture = this.frame(s, x, y, CELL, CELL);
    if (!texture) return;
    const sprite = new Sprite(texture);
    sprite.position.set((i % this.data.width) * CELL, Math.floor(i / this.data.width) * CELL);
    this.ground.addChild(sprite);
    this.groundSprites[i] = sprite;
  }

  private drawObject(o: MapObject) {
    const texture = this.frame(o.s, o.x, o.y, o.w, o.h);
    if (!texture) return;
    const sprite = new Sprite(texture);
    sprite.position.set(o.px, o.py);
    sprite.zIndex = o.py + o.h;
    this.addChild(sprite);
    this.objectSprites.set(o, sprite);
  }
}
