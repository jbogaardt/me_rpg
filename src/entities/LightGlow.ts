import { Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import type { Light } from '../systems/lights';

const SCALE = 5; // mask px per screen px, as in DarknessLayer

/**
 * The warm light of fires and torches over the world: one screen-sized additive sprite with a soft orange pool at each
 * light (`systems/lights.ts`), drawn above the night shade (which multiplies the whole world dark, fires included) and
 * above the underground's dark, so a fire at night actually lights its camp. `strength` (0 by day) fades the whole
 * layer; it hides itself when there is nothing to show. Visual only; every page builds its own from its map.
 */
export class LightGlow extends Sprite {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;

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
  }

  update(lights: readonly Light[], view: ViewRect, strength: number, width: number, height: number) {
    this.visible = strength > 0.02 && lights.length > 0;
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
    const k = width / view.w / SCALE;
    for (const l of lights) {
      const cx = (l.x - view.x) * k;
      const cy = (l.y - view.y) * k;
      const r = l.r * 0.9 * k;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(255, 168, 72, ${0.55 * l.k})`);
      g.addColorStop(0.45, `rgba(231, 104, 47, ${0.28 * l.k})`);
      g.addColorStop(1, 'rgba(231, 104, 47, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    this.texture.source.update();
    this.alpha = Math.min(1, strength);
    this.width = width;
    this.height = height;
  }
}
