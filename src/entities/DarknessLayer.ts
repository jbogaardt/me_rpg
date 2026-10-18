import { Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { Explored } from '../map/explored';
import { CELL, type MapData } from '../map/types';
import type { Light } from '../systems/lights';

/** The mask is drawn this many times smaller than the screen and stretched back smooth, so the light's edge is soft and cheap. */
const SCALE = 5;
/** How much of the dark lifts over ground the hero has already seen (the rest of the dim stays). */
const MEMORY = 0.38;

export interface Dark {
  /** The zone's name and its map (the memory of what was seen is kept per zone). */
  zone: string;
  data: MapData;
  view: ViewRect;
  /** Where the lit heroes stand (world px) and how far their own light reaches (cells). */
  heroes: readonly { x: number; y: number }[];
  radius: number;
  /** The fires, torches and lava on the screen. */
  lights: readonly Light[];
  /** 0.3 a gloom to 1 pitch black. */
  dim: number;
  memory: boolean;
}

/**
 * The fog of war of the underground (the `darkness` capability): one screen-sized sprite over the world that is dark
 * everywhere except in pools of light round each hero, each torch, fire and lava, and (with `memory`) faintly over what
 * was seen before. The mask is a small 2D canvas redrawn each frame (a dark fill with radial holes cut out of it) and
 * stretched smooth; it costs one quad and a tiny texture upload. Visual only: nothing hides from the rules (a mob in the
 * dark still sees you), and a co-op guest builds the same mask from its own map copy and the players' positions.
 * It is the one texture with linear filtering (everything else is nearest); the soft edge needs it.
 */
export class DarknessLayer extends Sprite {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private seen = new Map<string, Explored>();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    super(Texture.from(canvas));
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is needed for the dark');
    this.ctx = ctx;
    this.eventMode = 'none';
    this.visible = false;
    this.texture.source.scaleMode = 'linear';
  }

  /** What has been seen of a zone, forgotten with the game. */
  private memoryOf(d: Dark): Explored {
    let e = this.seen.get(d.zone);
    if (!e) this.seen.set(d.zone, (e = new Explored(d.data.width, d.data.height)));
    return e;
  }

  /** Redraw for this frame, or hide (`dark` null: the zone is lit, or the capability is off). */
  update(dark: Dark | null, width: number, height: number) {
    this.visible = dark !== null;
    if (!dark) return;
    const w = Math.max(2, Math.ceil(width / SCALE));
    const h = Math.max(2, Math.ceil(height / SCALE));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.texture.source.resize(w, h);
    }
    const { ctx } = this;
    const { view } = dark;
    const k = width / view.w / SCALE; // world px -> mask px
    const seen = this.memoryOf(dark);
    for (const hero of dark.heroes) seen.reveal(hero.x, hero.y - 16, dark.radius);

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(3, 5, 11, ${dark.dim})`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'destination-out';
    if (dark.memory) {
      ctx.fillStyle = `rgba(0, 0, 0, ${MEMORY})`;
      const c0 = Math.max(0, Math.floor(view.x / CELL));
      const c1 = Math.min(dark.data.width - 1, Math.floor((view.x + view.w) / CELL));
      const r0 = Math.max(0, Math.floor(view.y / CELL));
      const r1 = Math.min(dark.data.height - 1, Math.floor((view.y + view.h) / CELL));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          if (seen.cells[r * dark.data.width + c])
            ctx.fillRect((c * CELL - view.x) * k, (r * CELL - view.y) * k, CELL * k + 1, CELL * k + 1);
    }
    for (const hero of dark.heroes) this.pool(hero.x, hero.y - 16, dark.radius * CELL, view, k);
    for (const l of dark.lights) this.pool(l.x, l.y, l.r, view, k);
    this.texture.source.update();
    this.width = width;
    this.height = height;
  }

  /** Cut one soft round pool of light: clear at the middle, fading out at `r`. */
  private pool(x: number, y: number, r: number, view: ViewRect, k: number) {
    const cx = (x - view.x) * k;
    const cy = (y - view.y) * k;
    const radius = r * k;
    const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0.9)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
}
