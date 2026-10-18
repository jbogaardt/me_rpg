import { Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { CELL, type MapData } from '../map/types';
import { carriedFlicker, DARK_LEVELS, FOG_COLOR, poolProfile } from '../systems/darkLook';
import type { Light } from '../systems/lights';
import { DitherFilter } from './DitherFilter';

/** The mask is drawn this many times smaller than the screen and stretched back smooth; the filter then cuts it into pixel steps. */
const SCALE = 5;
/** How much of the dark lifts over ground the hero has already seen (the rest of the dim stays). */
const MEMORY = 0.38;
/** Where the hero has been is remembered as soft pools, one per cell of walking, so the remembered ground has no grid in it. */
const STAMP = CELL;
/** The darkest the unseen ground gets: a faint trace of the room stays, so an unexplored hall reads as dark, not as a hole. */
const PEAK_CAP = 0.94;

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
  /** Seconds, for the carried light's flicker. */
  time: number;
}

/** A pool of light drawn once: opaque at the middle, a flat core and a smooth fall to nothing (`poolProfile`). */
function poolCanvas(size: number, core: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed for the dark');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const stops = poolProfile(9, core);
  stops.forEach((a, i) => g.addColorStop(i / (stops.length - 1), `rgba(0, 0, 0, ${a.toFixed(3)})`));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * The fog of war of the underground (the `darkness` capability): one screen-sized sprite over the world that is dark
 * everywhere except in pools of light round each hero, each torch, fire and lava, and (with `memory`) faintly over what
 * was seen before. The smooth mask is a small 2D canvas redrawn each frame (a dark fill, pre-rendered pools stamped out of
 * it: no gradient made per frame) and stretched; `DitherFilter` then cuts it into a few flat steps stippled like pixel art,
 * anchored to the world pixels. The unseen ground fades to a deep blue-black (`FOG_COLOR`), never pure black. It costs one
 * quad, a tiny texture upload and one cheap shader pass. Visual only: nothing hides from the rules (a mob in the dark still
 * sees you), and a co-op guest builds the same mask from its own map copy and the players' positions.
 * Its texture is the one with linear filtering (everything else is nearest): the filter reads the smooth mask.
 */
export class DarknessLayer extends Sprite {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private seen = new Map<string, Map<number, { x: number; y: number }>>();
  private memoryCanvas = document.createElement('canvas');
  private memoryCtx: CanvasRenderingContext2D;
  private hero = poolCanvas(64, 0.3); // the carried light: a tight bright core
  private soft = poolCanvas(64, 0.1); // a torch or fire: a wider, gentler fall
  private memoryPool = poolCanvas(64, 0);
  private filter = new DitherFilter(DARK_LEVELS, PEAK_CAP, 0, FOG_COLOR);

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    super(Texture.from(canvas));
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    const mctx = this.memoryCanvas.getContext('2d');
    if (!ctx || !mctx) throw new Error('A 2D canvas is needed for the dark');
    this.ctx = ctx;
    this.memoryCtx = mctx;
    this.eventMode = 'none';
    this.visible = false;
    this.texture.source.scaleMode = 'linear';
    this.filters = [this.filter];
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
    const peak = Math.min(PEAK_CAP, dark.dim);
    this.filter.setPeak(peak);
    this.filter.setView(view);

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(0, 0, 0, ${peak})`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'destination-out';
    if (dark.memory) this.remembered(seen, dark, w, h, k);
    let i = 0;
    for (const hero of dark.heroes) {
      const r = dark.radius * CELL * carriedFlicker(dark.time, i++);
      this.pool(this.hero, hero.x, hero.y - 16, r, view, k);
    }
    for (const l of dark.lights) this.pool(this.soft, l.x, l.y, l.r, view, k);
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
    const m = this.memoryCtx;
    m.clearRect(0, 0, w, h);
    const reach = d.radius * CELL;
    const r = reach * k;
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
      m.drawImage(this.memoryPool, cx - r, cy - r, r * 2, r * 2);
    }
    this.ctx.globalAlpha = MEMORY;
    this.ctx.drawImage(mc, 0, 0);
    this.ctx.globalAlpha = 1;
  }

  /** Cut one pool of light out of the dark: clear at the middle, fading out at `r`. */
  private pool(pool: HTMLCanvasElement, x: number, y: number, r: number, view: ViewRect, k: number) {
    const cx = (x - view.x) * k;
    const cy = (y - view.y) * k;
    const radius = r * k;
    this.ctx.drawImage(pool, cx - radius, cy - radius, radius * 2, radius * 2);
  }
}
