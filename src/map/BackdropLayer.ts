import { Container, Texture, TilingSprite } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { factors, tileOffset, type BackdropStyle, type Factors } from './backdrop';

const FAR = 192; // px: a wrapped tile of distant rock (all art is made at the map's own pixel size, nearest-scaled)
const NEAR = 160;

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

/** A hard-edged disc (no antialiasing, so it stays pixel art) drawn with wrapped copies, so the tile repeats seamlessly. */
function disc(ctx: CanvasRenderingContext2D, size: number, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) ctx.fillRect(cx - half + ox, cy + dy + oy, half * 2 + 1, 1);
  }
}

/** The far layer: the dark, mottled with distant rock and a few faint glints. Opaque, it is the backdrop's floor. */
function farTexture(style: BackdropStyle): Texture {
  const [c, ctx] = canvas(FAR);
  const rnd = stream(0x51ed);
  ctx.fillStyle = css(style.base);
  ctx.fillRect(0, 0, FAR, FAR);
  for (let i = 0; i < 46; i++)
    disc(ctx, FAR, Math.floor(rnd() * FAR), Math.floor(rnd() * FAR), 5 + Math.floor(rnd() * 14), css(style.far));
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rnd() * FAR);
    const y = Math.floor(rnd() * FAR);
    ctx.fillStyle = css(style.glint);
    ctx.fillRect(x, y, 1 + Math.floor(rnd() * 2), 1);
  }
  ctx.globalAlpha = 1;
  return Texture.from(c);
}

/** The near layer: rock columns standing out of the dark, each with a lit rim on its top-left edge. Transparent between them. */
function nearTexture(style: BackdropStyle): Texture {
  const [c, ctx] = canvas(NEAR);
  const rnd = stream(0xc0ffee);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rnd() * NEAR);
    const y = Math.floor(rnd() * NEAR);
    const r = 9 + Math.floor(rnd() * 12);
    disc(ctx, NEAR, x, y, r, css(style.rim)); // the rim peeks out above and left of the body
    disc(ctx, NEAR, x + 2, y + 2, r - 1, css(style.near));
    disc(ctx, NEAR, x + 3, y + 4, Math.max(2, r - 5), css(style.far)); // a darker core
  }
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
