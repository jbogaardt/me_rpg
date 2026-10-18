import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CELL, DECAL_Z, type MapData } from '../map/types';
import { findHearths } from '../systems/hearths';
import { reflectionOf, waterRects } from '../systems/waterRuns';
import type { ViewRect } from '../core/camera';

/** Seconds a ripple row takes to slide one texture width: slow enough to read as a current, not a conveyor. */
const FLOW_A = 7; // px/s, to the right
const FLOW_B = 4.5; // px/s, to the left
/** Reflection bars under each torch, and the most of them that exist (a phone shows a few torches at a time). */
const BARS = 6;
const MAX_TORCHES = 12;

/** A white sprite texture with a few thin pale streaks (and wrapped copies, so it tiles): the ripples of the current. */
function ripples(w: number, h: number, count: number, seed: number, glints: boolean): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed for the water');
  let s = seed;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    const len = glints ? 1 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 9);
    ctx.fillStyle = glints ? 'rgba(255,255,255,0.95)' : `rgba(190,228,206,${(0.2 + rnd() * 0.22).toFixed(2)})`;
    for (const dx of [-w, 0, w]) ctx.fillRect(x + dx, y, len, 1);
    if (!glints && rnd() < 0.5) {
      ctx.fillStyle = 'rgba(8,20,16,0.28)'; // a dark trough under some of them
      for (const dx of [-w, 0, w]) ctx.fillRect(x + dx + 1, y + 2, Math.max(2, len - 3), 1);
    }
  }
  return Texture.from(c);
}

interface Bars {
  sprites: Sprite[];
  top: number;
  bottom: number;
  x: number;
  seed: number;
}

/**
 * The living look of the underground (`systems/waterRuns.ts` finds the water, `Hearth` runs the drips and mist): the
 * water's current as two slow ripple layers sliding over it (a tiling sprite per pool, scrolled in whole pixels, nothing
 * allocated per frame), a warm reflection of each torch that stands over a channel, wobbling with its flame. It lives in
 * the zone's world layer between the ground and the y-sorted things and costs a handful of quads, mostly off screen
 * (Pixi culls them). Visual only, built from the map and the clock, so a co-op guest needs nothing from the host.
 */
export class Atmosphere {
  private readonly root = new Container({ zIndex: DECAL_Z + 1 });
  private readonly pools: { x: number; y: number; w: number; h: number; a: TilingSprite; b: TilingSprite }[] = [];
  private readonly textures: Texture[] = [];
  private readonly reflections: Bars[] = [];

  constructor(
    private layer: Container,
    data: MapData,
  ) {
    const rects = waterRects(data);
    if (rects.length === 0) return;
    const flow = ripples(64, 32, 11, 7, false);
    const glint = ripples(64, 64, 7, 19, true);
    this.textures.push(flow, glint);
    for (const rect of rects) {
      const [x, y, w, h] = [rect.col * CELL, rect.row * CELL, rect.w * CELL, rect.h * CELL];
      const a = new TilingSprite({ texture: flow, width: w, height: h, position: { x, y } });
      const b = new TilingSprite({
        texture: glint,
        width: w,
        height: h,
        position: { x, y },
        blendMode: 'add',
        alpha: 0.5,
      });
      a.cullable = b.cullable = true;
      this.root.addChild(a, b);
      this.pools.push({ x, y, w, h, a, b });
    }
    const torches = findHearths(data)
      .filter((s) => s.kind === 'torch')
      .slice(0, MAX_TORCHES);
    for (const t of torches) {
      const hit = reflectionOf(t.x, t.y, rects);
      if (!hit) continue;
      const sprites = Array.from({ length: BARS }, () => {
        const s = new Sprite({ texture: Texture.WHITE, tint: 0xffa850, blendMode: 'add', anchor: { x: 0.5, y: 0 } });
        s.cullable = true;
        this.root.addChild(s);
        return s;
      });
      this.reflections.push({ sprites, top: hit.top, bottom: hit.bottom, x: hit.x, seed: t.x * 0.013 });
    }
    this.layer.addChild(this.root);
  }

  /** Slide the ripples and wobble the reflections for time `t` (seconds). `view` hides what is off screen. */
  update(view: ViewRect, t: number) {
    if (this.pools.length === 0) return;
    for (const p of this.pools) {
      const { x, y, w, h } = p;
      const near = x < view.x + view.w && x + w > view.x && y < view.y + view.h && y + h > view.y;
      p.a.visible = p.b.visible = near;
      if (!near) continue;
      p.a.tilePosition.set(Math.floor(t * FLOW_A), Math.floor(Math.sin(t * 0.4) * 2));
      p.b.tilePosition.set(-Math.floor(t * FLOW_B), Math.floor(t * 1.5));
    }
    for (const r of this.reflections) {
      const near = r.x > view.x - 60 && r.x < view.x + view.w + 60 && r.bottom > view.y && r.top < view.y + view.h;
      for (const s of r.sprites) s.visible = near;
      if (!near) continue;
      const span = Math.min(r.bottom - r.top - 8, 76);
      for (let i = 0; i < r.sprites.length; i++) {
        const s = r.sprites[i]!;
        const f = i / (BARS - 1); // 0 at the shore, 1 deepest
        const wob = Math.sin(t * 6.5 + r.seed * 3 + i * 1.9) + Math.sin(t * 11.1 + r.seed + i * 0.7) * 0.6;
        s.position.set(Math.round(r.x + wob * (1.5 + f * 2.5)), Math.round(r.top + 3 + f * span));
        s.width = Math.max(2, Math.round(14 - f * 9 + wob * 2.5));
        s.height = 1 + (i % 2);
        s.alpha = (0.85 - f * 0.55) * (0.7 + 0.3 * Math.sin(t * 9 + i + r.seed));
      }
    }
  }

  destroy() {
    this.layer.removeChild(this.root);
    this.root.destroy({ children: true });
    for (const t of this.textures) t.destroy(true); // the ripple textures are this zone's own
    this.textures.length = 0;
  }
}
