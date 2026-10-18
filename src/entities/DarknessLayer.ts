import { Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { CELL, type MapData } from '../map/types';
import type { Light } from '../systems/lights';

/** The mask is drawn this many times smaller than the screen and stretched back smooth, so the light's edge is soft and cheap. */
const SCALE = 5;
/** How much of the dark lifts over ground the hero has already seen (the rest of the dim stays). */
const MEMORY = 0.38;
/** Where the hero has been is remembered as soft pools, one per cell of walking, so the remembered ground has no grid in it. */
const STAMP = CELL;

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
  private seen = new Map<string, Map<number, { x: number; y: number }>>();
  private memoryCanvas = document.createElement('canvas');

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

  /** The pools of ground seen in a zone (keyed by the cell the hero stood in), forgotten with the game. */
  private memoryOf(d: Dark) {
    let m = this.seen.get(d.zone);
    if (!m) this.seen.set(d.zone, (m = new Map<number, { x: number; y: number }>()));
    return m;
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
    for (const hero of dark.heroes) {
      const key = Math.floor(hero.y / STAMP) * dark.data.width + Math.floor(hero.x / STAMP);
      if (!seen.has(key)) seen.set(key, { x: hero.x, y: hero.y - 16 });
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(3, 5, 11, ${dark.dim})`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'destination-out';
    if (dark.memory) this.remembered(seen, dark, w, h, k);
    for (const hero of dark.heroes) this.pool(hero.x, hero.y - 16, dark.radius * CELL, view, k);
    for (const l of dark.lights) this.pool(l.x, l.y, l.r, view, k);
    this.texture.source.update();
    this.width = width;
    this.height = height;
  }

  /** Lift the dark a little over every pool the hero has been in: drawn on a scratch canvas (overlaps saturate), then cut out faintly. */
  private remembered(seen: Map<number, { x: number; y: number }>, d: Dark, w: number, h: number, k: number) {
    const mc = this.memoryCanvas;
    if (mc.width !== w || mc.height !== h) {
      mc.width = w;
      mc.height = h;
    }
    const m = mc.getContext('2d');
    if (!m) return;
    m.clearRect(0, 0, w, h);
    const reach = d.radius * CELL;
    for (const p of seen.values()) {
      if (
        p.x < d.view.x - reach ||
        p.x > d.view.x + d.view.w + reach ||
        p.y < d.view.y - reach ||
        p.y > d.view.y + d.view.h + reach
      )
        continue;
      const cx = (p.x - d.view.x) * k;
      const cy = (p.y - d.view.y) * k;
      const r = reach * k;
      const g = m.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(0.55, 'rgba(0, 0, 0, 0.8)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      m.fillStyle = g;
      m.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    this.ctx.globalAlpha = MEMORY;
    this.ctx.drawImage(mc, 0, 0);
    this.ctx.globalAlpha = 1;
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
