import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { Lightning, type Weather, type WeatherKind } from '../systems/weather';

// Draws the current weather over the world: a tinted haze plus a fixed pool of tiny sprites (rain streaks, snow,
// blown sand, wind gusts) that wrap around the camera's view. Nothing is allocated per frame.

const POOL = 800;

interface Style {
  count: number; // particles at full intensity
  tint: number;
  alpha: number;
  w: [number, number]; // size in world px (a rain streak is thin and tall)
  h: [number, number];
  vx: number; // px/s added per unit of wind; the base fall below is independent of it
  fall: [number, number]; // px/s downwards
  sway: number; // px of side to side drift (snow)
  tilt: boolean; // point along the motion (streaks)
}

const STYLES: Partial<Record<WeatherKind, Style>> = {
  wind: { count: 26, tint: 0xffffff, alpha: 0.55, w: [8, 14], h: [1, 1], vx: 260, fall: [-4, 6], sway: 0, tilt: true },
  rain: {
    count: 420,
    tint: 0x4a7fd0,
    alpha: 0.95,
    w: [2, 3],
    h: [10, 16],
    vx: 120,
    fall: [300, 360],
    sway: 0,
    tilt: true,
  },
  storm: {
    count: 560,
    tint: 0x5a8ce0,
    alpha: 1,
    w: [3, 4],
    h: [18, 28],
    vx: 170,
    fall: [420, 520],
    sway: 0,
    tilt: true,
  },
  snow: {
    count: 520,
    tint: 0xffffff,
    alpha: 1,
    w: [4, 6],
    h: [4, 6],
    vx: 90,
    fall: [26, 48],
    sway: 10,
    tilt: false,
  },
  blizzard: {
    count: 800,
    tint: 0xffffff,
    alpha: 1,
    w: [4, 6],
    h: [4, 6],
    vx: 240,
    fall: [60, 100],
    sway: 6,
    tilt: false,
  },
  sandstorm: {
    count: 700,
    tint: 0xd89a3c,
    alpha: 1,
    w: [2, 3],
    h: [8, 16],
    vx: 320,
    fall: [-2, 2], // blows in from the sides, not down from the sky
    sway: 0,
    tilt: true,
  },
};

/** The colour and strength of the haze over the whole view (strong enough to read against bright ground). */
const HAZE: Partial<Record<WeatherKind, { tint: number; alpha: number }>> = {
  rain: { tint: 0x16233a, alpha: 0.34 },
  storm: { tint: 0x060a18, alpha: 0.58 },
  snow: { tint: 0x5a6e90, alpha: 0.38 }, // dim the bright ground so white flakes stand out
  blizzard: { tint: 0x8498b8, alpha: 0.5 },
  sandstorm: { tint: 0x8a5518, alpha: 0.55 },
};

interface Drop {
  sprite: Sprite;
  x: number;
  y: number;
  fall: number;
  phase: number;
  sway: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const between = ([a, b]: [number, number]) => rand(a, b);

export class WeatherLayer {
  readonly view = new Container();
  private haze: Sprite;
  private drops: Drop[] = [];
  private active = 0; // drops currently in play (the rest are hidden)
  private kind: WeatherKind = 'clear';
  private clock = 0;
  private flash: Sprite;
  private bolt = new Graphics();
  private lightning = new Lightning();
  private glow = 0; // 1 right after a strike, fading to 0

  /** `layer` is the map's y-sorted layer; the weather sorts just under the top effects. */
  constructor(layer: Container) {
    const pixel = Texture.WHITE;
    this.haze = new Sprite(pixel);
    this.haze.visible = false;
    this.view.addChild(this.haze);
    this.flash = new Sprite(pixel);
    this.flash.visible = false;
    this.flash.tint = 0xeef4ff;
    for (let i = 0; i < POOL; i++) {
      const sprite = new Sprite(pixel);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.view.addChild(sprite);
      this.drops.push({ sprite, x: 0, y: 0, fall: 0, phase: 0, sway: 0 });
    }
    this.view.addChild(this.flash, this.bolt);
    this.view.zIndex = 1e9 - 1;
    layer.addChild(this.view);
  }

  update(dt: number, weather: Weather, view: ViewRect) {
    this.clock += dt;
    const style = STYLES[weather.kind];
    if (weather.kind !== this.kind) {
      this.kind = weather.kind;
      this.active = 0; // intensity is ~0 whenever the kind changes, so restarting the pool is invisible
    }

    const haze = HAZE[weather.kind];
    this.haze.visible = !!haze && weather.intensity > 0;
    if (haze && this.haze.visible) {
      this.haze.tint = haze.tint;
      this.haze.alpha = haze.alpha * weather.intensity;
      this.haze.position.set(view.x, view.y);
      this.haze.width = view.w;
      this.haze.height = view.h;
    }

    this.strikes(dt, weather, view);

    const want = style ? Math.min(POOL, Math.round(style.count * weather.intensity)) : 0;
    while (this.active < want) this.spawn(this.drops[this.active++]!, style!, view, true);
    while (this.active > want) {
      const d = this.drops[--this.active];
      if (d) d.sprite.visible = false;
    }
    if (!style) return;

    const wind = weather.wind;
    for (let i = 0; i < this.active; i++) {
      const d = this.drops[i]!;
      const vx = style.vx * wind;
      d.x += vx * dt;
      d.y += d.fall * dt;
      // Wrap around the view so the sky stays full whichever way the camera and wind move.
      // A camera jump (map change, respawn) strands drops far away: refill the whole view instead of one edge.
      if (d.x < view.x - 96 || d.x > view.x + view.w + 96 || d.y < view.y - 96 || d.y > view.y + view.h + 96) {
        this.spawn(d, style, view, true);
      } else if (d.x < view.x - 8 || d.x > view.x + view.w + 8)
        this.spawn(d, style, view, false, vx > 0 ? 'left' : 'right');
      else if (d.y > view.y + view.h + 8 || d.y < view.y - 12)
        this.spawn(d, style, view, false, d.fall >= 0 ? 'top' : 'bottom');
      const sway = d.sway ? Math.sin(this.clock * 1.6 + d.phase) * d.sway : 0;
      d.sprite.position.set(d.x + sway, d.y);
      d.sprite.rotation = style.tilt ? Math.atan2(-vx, d.fall) : 0;
    }
  }

  /** Put a drop in play: anywhere in the view, or (when it wrapped) on the edge it re-enters from. */
  private spawn(d: Drop, style: Style, view: ViewRect, anywhere: boolean, edge?: 'left' | 'right' | 'top' | 'bottom') {
    d.x = view.x + Math.random() * view.w;
    d.y = view.y + Math.random() * view.h;
    if (!anywhere) {
      if (edge === 'left') d.x = view.x - 4;
      else if (edge === 'right') d.x = view.x + view.w + 4;
      else if (edge === 'top') d.y = view.y - 8;
      else d.y = view.y + view.h + 8;
    }
    d.fall = between(style.fall);
    d.phase = rand(0, Math.PI * 2);
    d.sway = style.sway ? rand(style.sway * 0.4, style.sway) : 0;
    const s = d.sprite;
    s.width = between(style.w);
    s.height = between(style.h);
    s.tint = style.tint;
    s.alpha = style.alpha * rand(0.7, 1);
    s.visible = true;
  }

  /** Lightning during a storm: a jagged bolt from the sky and a white flash that fades quickly. */
  private strikes(dt: number, weather: Weather, view: ViewRect) {
    const stormy = weather.kind === 'storm' && weather.intensity > 0.5;
    if (this.lightning.update(dt, stormy)) {
      this.glow = 1;
      const bolt = this.bolt;
      bolt.clear();
      let x = view.x + view.w * (0.1 + Math.random() * 0.8);
      let y = view.y;
      const bottom = view.y + view.h * (0.45 + Math.random() * 0.4);
      const path: [number, number][] = [[x, y]];
      while (y < bottom) {
        y += 12 + Math.random() * 14;
        x += (Math.random() - 0.5) * 28;
        path.push([x, y]);
      }
      for (const [width, color] of [
        [7, 0x9ab8ff],
        [3, 0xffffff],
      ] as const) {
        bolt.moveTo(path[0]![0], path[0]![1]);
        for (const [px, py] of path) bolt.lineTo(px, py);
        bolt.stroke({ width, color, join: 'round', cap: 'round' });
      }
    }
    this.glow = Math.max(0, this.glow - dt * 3.5);
    this.flash.visible = this.bolt.visible = this.glow > 0;
    if (this.glow > 0) {
      this.flash.position.set(view.x, view.y);
      this.flash.width = view.w;
      this.flash.height = view.h;
      this.flash.alpha = this.glow * 0.55;
      this.bolt.alpha = Math.min(1, this.glow * 1.5);
    }
  }
}
