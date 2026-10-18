import { Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { carriedFlicker, GLOW_LEVELS } from '../systems/darkLook';
import type { Light } from '../systems/lights';
import { DitherFilter } from './DitherFilter';

const SCALE = 5; // mask px per screen px, as in DarknessLayer
/** The glow's brightest step (alpha of the additive colour at a flame's heart). */
const PEAK = 0.55;
/** A hero's carried light warms the stone about this far (share of its reach), tight beside the flame's own pool. */
const HERO_REACH = 0.5;
const HERO_PEAK = 0.2;

/** What the warm light of the carried lamp needs: where the lit heroes are, how far their light reaches (px) and the time. */
export interface Carried {
  heroes: readonly { x: number; y: number }[];
  reach: number;
  time: number;
}

/** A warm pool drawn once (white-orange heart, orange middle, nothing at the rim); stamped per light, scaled, with no gradient made per frame. */
function warmPool(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed for the glow');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255, 168, 72, ${PEAK})`);
  g.addColorStop(0.45, `rgba(231, 104, 47, ${PEAK * 0.5})`);
  g.addColorStop(1, 'rgba(231, 104, 47, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * The warm light of fires and torches over the world: one screen-sized additive sprite with an orange pool at each
 * light (`systems/lights.ts`), drawn above the night shade (which multiplies the whole world dark, fires included) and
 * above the underground's dark, so a fire at night actually lights its camp. Underground each hero's carried lamp adds a
 * tight warm pool of its own, and every pool breathes with its flame (`Light.f`). The soft pools are cut into a few
 * dithered steps like the dark is (`DitherFilter`). `strength` (0 by day) fades the whole layer; it hides itself when
 * there is nothing to show. Visual only; every page builds its own from its map.
 */
export class LightGlow extends Sprite {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private pool = warmPool(64);
  private filter = new DitherFilter(GLOW_LEVELS, PEAK, 1);

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    super(Texture.from(canvas));
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is needed for the glow');
    this.ctx = ctx;
    this.blendMode = 'add';
    this.eventMode = 'none';
    this.visible = false;
    this.texture.source.scaleMode = 'linear';
    this.filters = [this.filter];
  }

  update(lights: readonly Light[], view: ViewRect, strength: number, width: number, height: number, carried?: Carried) {
    const hero = carried && carried.heroes.length > 0;
    this.visible = strength > 0.02 && (lights.length > 0 || !!hero);
    if (!this.visible) return;
    const w = Math.max(2, Math.ceil(width / SCALE));
    const h = Math.max(2, Math.ceil(height / SCALE));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.texture.source.resize(w, h);
    }
    const { ctx } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const k = width / view.w / SCALE;
    for (const l of lights) {
      const cx = (l.x - view.x) * k;
      const cy = (l.y - view.y) * k;
      const r = l.r * 0.9 * k;
      ctx.globalAlpha = Math.min(1, l.f ?? 1);
      ctx.drawImage(this.pool, cx - r, cy - r, r * 2, r * 2);
    }
    if (carried && hero) {
      let i = 0;
      for (const p of carried.heroes) {
        const cx = (p.x - view.x) * k;
        const cy = (p.y - 16 - view.y) * k;
        const r = carried.reach * HERO_REACH * carriedFlicker(carried.time, i++) * k;
        ctx.globalAlpha = HERO_PEAK / PEAK;
        ctx.drawImage(this.pool, cx - r, cy - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.filter.setView(view);
    this.texture.source.update();
    this.alpha = Math.min(1, strength);
    this.width = width;
    this.height = height;
  }
}
