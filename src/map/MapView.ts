import { Container, Sprite, type Texture } from 'pixi.js';
import { makeFrame } from '../core/textures';
import type { ViewRect } from '../core/camera';
import { BackdropLayer } from './BackdropLayer';
import { BACKDROPS, isBackdrop } from './backdrop';
import { chunkRange, chunksOfObjects, CHUNK } from './chunks';
import { CELL, sortKey, type MapData, type MapObject } from './types';

/** A built chunk: its ground, and its objects' sprites with their indices in `MapData.objects`. */
interface Chunk {
  ground: Container;
  objects: Sprite[];
  ids: number[];
}

/**
 * Renders a MapData as layers inside one render group (so the camera moving or zooming it is a single GPU transform):
 *  - `backdrop` (only a map that names one): the far dark under the ground, shown through its cells with no ground and
 *    slid slower than the camera (`BackdropLayer.ts`, `parallax` capability).
 *  - `ground`: the 32px ground cells (a cell may stack several layers). The margin of a neighbouring biome (surface
 *    `beyond`) is not drawn, nor are objects standing in it: the scene lays that neighbour's own view beside this one.
 *  - `layer`: map objects (trees, rocks...) plus whatever the scene adds (characters, effects). Children are
 *    y-sorted by `zIndex`; the scene sets `zIndex` to a character's feet y so it sorts with the objects.
 *
 * Only the part of the map around the camera exists as sprites: the map is cut into CHUNK x CHUNK-cell chunks and
 * `update(view)` builds the chunks near the view (each chunk's ground is its own render group, built once) and frees
 * the ones left behind. So a big map costs about what a small one does; the data stays, the sprites come and go.
 * Call `update` every frame, after the camera moved. (tools/map/image.ts draws the same way in Node for previews.)
 */
export class MapView extends Container {
  /** The far backdrop under the ground (a map that names one in `data.backdrop`), shown through its empty cells. */
  readonly backdrop: BackdropLayer | null;
  readonly ground = new Container({ isRenderGroup: true });
  readonly layer = new Container({ sortableChildren: true });
  private frames = new Map<string, Texture | null>();
  private byChunk: number[][]; // object indices by the chunk their foot stands in
  private live = new Map<number, Chunk>(); // built chunks by index
  private sprites = new Map<number, Sprite>(); // the built sprite of each map object on screen, by its index in `objects`
  private fade = new Map<number, number>(); // map objects drawn faded (0 hidden), by index: e.g. lily pads on a dry pond
  private readonly cols: number; // chunks across
  private readonly rows: number;
  private readonly beyond: number; // the surface index of a neighbour's margin, which another zone's view draws (-1 in a room)

  constructor(
    readonly data: MapData,
    private textures: Map<string, Texture>,
  ) {
    super({ isRenderGroup: true });
    this.ground.cullableChildren = false; // only chunks near the view exist, so there is nothing far to cull
    const style = data.backdrop && isBackdrop(data.backdrop) ? BACKDROPS[data.backdrop] : null;
    this.backdrop = style ? new BackdropLayer(style) : null;
    if (this.backdrop) this.addChild(this.backdrop);
    this.addChild(this.ground, this.layer);
    this.cols = Math.ceil(data.width / CHUNK);
    this.rows = Math.ceil(data.height / CHUNK);
    this.byChunk = chunksOfObjects(data);
    this.beyond = data.surfaces.indexOf('beyond');
  }

  /** How many chunks are built (for tests and the memory check in the playtest). */
  get chunks(): number {
    return this.live.size;
  }

  /** Build the chunks around `view` (world px) and free those well away from it. */
  update(view: ViewRect) {
    this.backdrop?.update(view);
    const near = chunkRange(view, this.cols, this.rows, 1);
    const keep = chunkRange(view, this.cols, this.rows, 2);
    for (const [i, chunk] of this.live) {
      const cx = i % this.cols,
        cy = Math.floor(i / this.cols);
      if (cx < keep.c0 || cx > keep.c1 || cy < keep.r0 || cy > keep.r1) this.free(i, chunk);
    }
    for (let cy = near.r0; cy <= near.r1; cy++)
      for (let cx = near.c0; cx <= near.c1; cx++) if (!this.live.has(cy * this.cols + cx)) this.build(cx, cy);
  }

  /** Free every built chunk: the zone is not on screen any more (`update` builds them again when it is). */
  release() {
    for (const [i, chunk] of this.live) this.free(i, chunk);
  }

  private build(cx: number, cy: number) {
    const { data } = this;
    const ground = new Container({ isRenderGroup: true });
    ground.cullableChildren = false;
    for (let row = cy * CHUNK; row < Math.min(data.height, (cy + 1) * CHUNK); row++) {
      for (let col = cx * CHUNK; col < Math.min(data.width, (cx + 1) * CHUNK); col++) {
        const cell = data.ground[row * data.width + col];
        if (!cell || this.isBeyond(col, row)) continue;
        // A cell is one or more [sheet, x, y] layers, bottom first.
        for (let k = 0; k + 2 < cell.length; k += 3) {
          const texture = this.frame(cell[k]!, cell[k + 1]!, cell[k + 2]!, CELL, CELL);
          if (!texture) continue;
          const sprite = new Sprite(texture);
          sprite.position.set(col * CELL, row * CELL);
          ground.addChild(sprite);
        }
      }
    }
    this.ground.addChild(ground);
    const objects: Sprite[] = [];
    const ids: number[] = []; // the index in `data.objects` of each sprite
    for (const i of this.byChunk[cy * this.cols + cx] ?? []) {
      const o = data.objects[i]!;
      if (this.isBeyond(Math.floor((o.px + o.w / 2) / CELL), Math.floor((o.py + o.h - 1) / CELL))) continue;
      const texture = this.frame(o.s, o.x, o.y, o.w, o.h);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.position.set(o.px, o.py);
      sprite.zIndex = sortKey(o);
      sprite.cullable = true; // the chunks round the view are built, but only what is on screen is drawn
      this.applyFade(sprite, this.fade.get(i) ?? 1);
      this.sprites.set(i, sprite);
      objects.push(sprite);
      ids.push(i);
    }
    if (objects.length) this.layer.addChild(...objects);
    this.live.set(cy * this.cols + cx, { ground, objects, ids });
  }

  /**
   * Draw a map object faded (1 as made, 0 hidden), e.g. the lily pads of a pond drunk dry. Kept while its chunk is freed
   * and built again.
   */
  setObjectAlpha(index: number, alpha: number) {
    if (alpha >= 1) this.fade.delete(index);
    else this.fade.set(index, alpha);
    const sprite = this.sprites.get(index);
    if (sprite) this.applyFade(sprite, alpha);
  }

  /** The art of a map object, for an entity that stands in its place (a barrel being carried). Null if its sheet is missing. */
  objectTexture(o: MapObject): Texture | null {
    return this.frame(o.s, o.x, o.y, o.w, o.h);
  }

  private applyFade(sprite: Sprite, alpha: number) {
    sprite.alpha = alpha;
    sprite.visible = alpha > 0;
  }

  /** Is this cell a neighbouring biome's margin? Only the zone's own cells are drawn here: the neighbour draws the rest. */
  private isBeyond(col: number, row: number): boolean {
    const { data } = this;
    return this.beyond >= 0 && data.surface[row * data.width + col] === this.beyond;
  }

  private free(i: number, chunk: Chunk) {
    // The textures are frames of the shared tilesets: keep them (the frame cache reuses them when the chunk returns).
    chunk.ground.destroy({ children: true });
    for (const id of chunk.ids) this.sprites.delete(id);
    for (const s of chunk.objects) s.destroy();
    this.live.delete(i);
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

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.release();
    super.destroy(options);
    for (const t of this.frames.values()) t?.destroy(); // the frames, not the tileset they point into
    this.frames.clear();
  }
}
