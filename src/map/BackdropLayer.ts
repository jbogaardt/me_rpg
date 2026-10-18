import { Container, Texture, TilingSprite } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { DUST_DRIFT, factors, tileOffset, type BackdropStyle, type Factors } from './backdrop';

const FAR = 192; // px: a wrapped tile of distant rock (all art is made at the map's own pixel size, nearest-scaled)
const BAND = 50; // px: how far down a ridge's rock reaches before the dark shows again
const NEAR = 160;
const SHADE = 256; // the foreground's wrapped tiles: stalactite shadows, and dust
const DUST = 176;

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A seeded pseudo-random stream in 0..1 (the art is the same on every page and every load). */
function stream(seed: number) {
  let s = seed;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed for the cave backdrop');
  return [c, ctx];
}

/** One column per pixel of a wavy height in 0..1 that repeats at `size` (whole harmonics), so a ridge tiles seamlessly. */
function ridge(size: number, rnd: () => number, harmonics: number): (x: number) => number {
  const waves = Array.from({ length: harmonics }, (_, i) => ({
    k: i * 2 + 1 + Math.floor(rnd() * 3),
    phase: rnd() * Math.PI * 2,
    amp: 1 / (i + 1),
  }));
  const total = waves.reduce((sum, w) => sum + w.amp, 0);
  return (x) =>
    0.5 + waves.reduce((sum, w) => sum + w.amp * Math.sin((x / size) * w.k * Math.PI * 2 + w.phase), 0) / (2 * total);
}

/** Glowing lava far below the rock: wavy rivers with a hot core and a soft stepped glow either side, wrapped so the tile repeats. The ridges are laid over them, so they show through the gaps. */
function lavaRivers(ctx: CanvasRenderingContext2D, rnd: () => number, glow: number, hot: number) {
  for (let i = 0; i < 3; i++) {
    const y0 = Math.floor(((i + 0.1 + rnd() * 0.4) * FAR) / 3);
    const height = ridge(FAR, rnd, 5);
    const width = ridge(FAR, rnd, 3); // the river swells and narrows
    for (let x = 0; x < FAR; x++) {
      const y = y0 + Math.floor(height(x) * 34);
      const swell = 0.4 + width(x) * 1.2;
      for (const [dy, h, color, alpha] of [
        [-14, 30, glow, 0.16],
        [-8, 18, glow, 0.3],
        [-4, 10, glow, 0.55],
        [-2, 5, hot, 0.85],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = css(color);
        for (const oy of [-FAR, 0, FAR])
          ctx.fillRect(x, y + Math.round(dy * swell) + oy, 1, Math.max(1, Math.round(h * swell)));
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** The far layer: the dark of a deep cavern, rock walls receding in bands (a jagged skyline each, farther is darker) and a few faint glints. Opaque, it is the backdrop's floor. */
function farTexture(style: BackdropStyle): Texture {
  const [c, ctx] = canvas(FAR);
  const rnd = stream(0x51ed);
  ctx.fillStyle = css(style.base);
  ctx.fillRect(0, 0, FAR, FAR);
  if (style.lava !== undefined) lavaRivers(ctx, rnd, style.lava, style.lavaHot ?? style.lava);
  const bands = 3;
  for (let b = 0; b < bands; b++) {
    const top = Math.floor(((b + 0.6) * FAR) / bands);
    const height = ridge(FAR, rnd, 5);
    ctx.globalAlpha = 0.35 + (0.65 * (b + 1)) / bands;
    ctx.fillStyle = css(style.far);
    for (let x = 0; x < FAR; x++) {
      const y = top - Math.floor(height(x) * 44);
      // Jagged: a chipped step every few columns, hard-edged so it stays pixel art.
      const chip = (x * 7 + b * 13) % 5 === 0 ? 2 : 0;
      for (const oy of [0, -FAR]) ctx.fillRect(x, y + chip + oy, 1, BAND); // a band, wrapped so the tile repeats
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = css(style.glint);
    ctx.fillRect(Math.floor(rnd() * FAR), Math.floor(rnd() * FAR), 1 + Math.floor(rnd() * 2), 1);
  }
  ctx.globalAlpha = 1;
  return Texture.from(c);
}

/** A hard-edged rock spike (a stalactite when `down`, else a stalagmite), jagged, with a lit rim on its left edge. */
function spike(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  w: number,
  h: number,
  down: boolean,
  rnd: () => number,
  style: BackdropStyle,
) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const half = Math.max(1, Math.round((w / 2) * (1 - t) ** 0.8 + (rnd() < 0.3 ? 1 : 0)));
    const y = down ? i : size - 1 - i;
    for (const ox of [-size, 0, size]) {
      ctx.fillStyle = css(style.near);
      ctx.fillRect(x - half + ox, y, half * 2, 1);
      ctx.fillStyle = css(style.rim);
      ctx.fillRect(x - half + ox, y, 1, 1);
    }
  }
}

/** The near layer: stalactites hanging from the cavern's roof and stalagmites rising from its floor, each with a lit rim. Transparent between them. */
function nearTexture(style: BackdropStyle): Texture {
  const [c, ctx] = canvas(NEAR);
  const rnd = stream(0xc0ffee);
  for (const down of [true, false])
    for (let i = 0; i < 3; i++)
      spike(
        ctx,
        NEAR,
        Math.floor((i + 0.15 + rnd() * 0.7) * (NEAR / 3)),
        6 + Math.floor(rnd() * 8),
        14 + Math.floor(rnd() * 24),
        down,
        rnd,
        style,
      );
  return Texture.from(c);
}

/**
 * What shows through a map's empty cells: two tiling sprites laid over the camera's view, each scrolled by a share of the
 * camera's move (`factors`), so they slide slower than the floor. The sprites are resized and slid each frame (two quads,
 * nothing allocated). A depth of 0 puts both on the floor's own scroll: plain dark, no parallax (capability off).
 */
export class BackdropLayer extends Container {
  private readonly far: TilingSprite;
  private readonly near: TilingSprite;
  private f: Factors = factors(0);

  constructor(style: BackdropStyle) {
    super();
    this.far = new TilingSprite({ texture: farTexture(style) });
    this.near = new TilingSprite({ texture: nearTexture(style), alpha: 0.9 });
    this.addChild(this.far, this.near);
  }

  /** How far behind the floor the layers lie, 0 (with the floor) to 1 (almost still): the `parallax` capability's `depth`. */
  setDepth(depth: number) {
    this.f = factors(depth);
  }

  /** Lay the layers over `view` (world px) and slide them by their share of where the camera is. */
  update(view: ViewRect) {
    const [w, h] = [Math.ceil(view.w) + 2, Math.ceil(view.h) + 2];
    for (const [sprite, factor] of [
      [this.far, this.f.far],
      [this.near, this.f.near],
    ] as const) {
      sprite.position.set(Math.floor(view.x), Math.floor(view.y));
      sprite.width = w;
      sprite.height = h;
      const o = tileOffset({ x: Math.floor(view.x), y: Math.floor(view.y) }, factor);
      sprite.tilePosition.set(o.x, o.y);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.far.texture.destroy(true);
    this.near.texture.destroy(true);
    super.destroy(options);
  }
}

/** The shadows of stalactites hanging overhead: soft dark shapes, taller than wide, stepped in three alphas (hard-edged, so it stays pixel art). */
function shadeTexture(style: BackdropStyle): Texture {
  const [c, ctx] = canvas(SHADE);
  const rnd = stream(0xdeca);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rnd() * SHADE);
    const y = Math.floor(rnd() * SHADE);
    const r = 8 + Math.floor(rnd() * 8);
    for (const [grow, alpha] of [
      [1, 0.07],
      [0.7, 0.07],
      [0.4, 0.09],
    ] as const) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = css(style.shade);
      const rr = Math.floor(r * grow);
      for (let dy = 0; dy < rr * 4; dy++) {
        const half = Math.max(1, Math.floor(rr * (1 - dy / (rr * 4))));
        for (const ox of [-SHADE, 0, SHADE])
          for (const oy of [-SHADE, 0, SHADE]) ctx.fillRect(x - half + ox, y + dy + oy, half * 2, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  return Texture.from(c);
}

/** Motes of dust: single pale pixels, a few of them 2x1, faint. */
function dustTexture(style: BackdropStyle): Texture {
  const [c, ctx] = canvas(DUST);
  const rnd = stream(0xd057);
  ctx.fillStyle = css(style.dust);
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.3;
    ctx.fillRect(Math.floor(rnd() * DUST), Math.floor(rnd() * DUST), rnd() < 0.3 ? 2 : 1, 1);
  }
  ctx.globalAlpha = 1;
  return Texture.from(c);
}

/**
 * The foreground over the floor (above the heroes, under the darkness): stalactite shadows and drifting dust, laid over the
 * view and slid FASTER than the camera (`factors().front`), so they pass close by and the floor reads as lying between
 * the layers. The dust also drifts on its own. Hidden when the depth is 0 (capability off). Two quads, nothing allocated.
 */
export class ForegroundLayer extends Container {
  private readonly shade: TilingSprite;
  private readonly dust: TilingSprite;
  private f: Factors = factors(0);

  constructor(style: BackdropStyle) {
    super();
    this.shade = new TilingSprite({ texture: shadeTexture(style) });
    this.dust = new TilingSprite({ texture: dustTexture(style) });
    this.addChild(this.shade, this.dust);
    this.eventMode = 'none';
    this.visible = false;
  }

  /** The `parallax` capability's `depth` (0 = off: the layer is hidden). */
  setDepth(depth: number) {
    this.f = factors(depth);
    this.visible = this.f.front > 1;
  }

  /** Lay the layers over `view` (world px) at time `t` (seconds). */
  update(view: ViewRect, t: number) {
    if (!this.visible) return;
    const [w, h] = [Math.ceil(view.w) + 2, Math.ceil(view.h) + 2];
    const [vx, vy] = [Math.floor(view.x), Math.floor(view.y)];
    for (const [sprite, factor, dx, dy] of [
      [this.shade, this.f.front, 0, 0],
      [this.dust, this.f.front * 1.15, t * DUST_DRIFT.x, -t * DUST_DRIFT.y],
    ] as const) {
      sprite.position.set(vx, vy);
      sprite.width = w;
      sprite.height = h;
      const o = tileOffset({ x: vx, y: vy }, factor);
      sprite.tilePosition.set(o.x - Math.floor(dx), o.y - Math.floor(dy));
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.shade.texture.destroy(true);
    this.dust.texture.destroy(true);
    super.destroy(options);
  }
}
