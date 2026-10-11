import { Container, Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import type { Weather, WeatherKind } from '../systems/weather';

// Draws the current weather over the world: a tinted haze plus a fixed pool of tiny sprites (rain streaks, snow,
// blown sand, wind gusts) that wrap around the camera's view. Nothing is allocated per frame.

const POOL = 320;

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
  wind: { count: 22, tint: 0xffffff, alpha: 0.45, w: [8, 14], h: [1, 1], vx: 260, fall: [-4, 6], sway: 0, tilt: true },
  rain: {
    count: 150,
    tint: 0xa9c4e0,
    alpha: 0.55,
    w: [1, 1],
    h: [5, 8],
    vx: 120,
    fall: [260, 330],
    sway: 0,
    tilt: true,
  },
  storm: {
    count: 280,
    tint: 0x9fb8d6,
    alpha: 0.6,
    w: [1, 1],
    h: [6, 10],
    vx: 150,
    fall: [320, 400],
    sway: 0,
    tilt: true,
  },
  snow: { count: 130, tint: 0xd4e4f8, alpha: 1, w: [2, 3], h: [2, 3], vx: 90, fall: [22, 42], sway: 8, tilt: false },
  blizzard: {
    count: 280,
    tint: 0xf2f7ff,
    alpha: 0.85,
    w: [2, 3],
    h: [2, 2],
    vx: 240,
    fall: [55, 95],
    sway: 5,
    tilt: false,
  },
  sandstorm: {
    count: 260,
    tint: 0xd2a45a,
    alpha: 0.6,
    w: [2, 4],
    h: [1, 1],
    vx: 300,
    fall: [-6, 12],
    sway: 0,
    tilt: true,
  },
};

/** The colour and strength of the haze over the whole view. */
const HAZE: Partial<Record<WeatherKind, { tint: number; alpha: number }>> = {
  rain: { tint: 0x1c2a40, alpha: 0.16 },
  storm: { tint: 0x141d30, alpha: 0.3 },
  snow: { tint: 0xdfe8f5, alpha: 0.08 },
  blizzard: { tint: 0xe8f0ff, alpha: 0.34 },
  sandstorm: { tint: 0xb5832f, alpha: 0.3 },
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

  /** `layer` is the map's y-sorted layer; the weather sorts just under the top effects. */
  constructor(layer: Container) {
    const pixel = Texture.WHITE;
    this.haze = new Sprite(pixel);
    this.haze.visible = false;
    this.view.addChild(this.haze);
    for (let i = 0; i < POOL; i++) {
      const sprite = new Sprite(pixel);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.view.addChild(sprite);
      this.drops.push({ sprite, x: 0, y: 0, fall: 0, phase: 0, sway: 0 });
    }
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
      if (d.x < view.x - 8 || d.x > view.x + view.w + 8) this.spawn(d, style, view, false, vx > 0 ? 'left' : 'right');
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
}
