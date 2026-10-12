import { Container, Graphics, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { mulberry32 } from '../systems/particles';
import type { Precip, Weather } from '../systems/weather';

// Draws the current weather over the world: a tinted haze (some kinds) plus a fixed pool of tiny particles (rain
// streaks, snow, blown sand, wind gusts) that wrap around the camera's view. The particles are one ParticleContainer,
// so they cost one draw call however many there are, and nothing is allocated per frame. Weather is a backdrop: keep it
// light on the eye and on the frame rate (no full-screen frame, no heavy dimming).

const POOL = 800;

/** Where a lightning bolt lands (world px) and the seed that shapes it. */
export interface Strike {
  x: number;
  y: number;
  seed: number;
}

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

/** What a layer can show: each precipitation, and `gust` (wind with nothing falling). */
type Look = Precip | 'gust';

const STYLES: Partial<Record<Look, Style>> = {
  gust: { count: 26, tint: 0xffffff, alpha: 0.55, w: [8, 14], h: [1, 1], vx: 260, fall: [-4, 6], sway: 0, tilt: true },
  rain: {
    count: 420,
    tint: 0x4a7fd0,
    alpha: 0.95,
    w: [1, 2],
    h: [7, 11],
    vx: 120,
    fall: [300, 360],
    sway: 0,
    tilt: true,
  },
  storm: {
    count: 230,
    tint: 0x3563b0,
    alpha: 1,
    w: [1, 2],
    h: [12, 18],
    vx: 170,
    fall: [420, 520],
    sway: 0,
    tilt: true,
  },
  // Snow is a fast, fine backdrop: many small quick flakes, evenly spread (see Drop.u/v), not big drifting blobs.
  snow: {
    count: 230,
    tint: 0xffffff,
    alpha: 1,
    w: [3, 5],
    h: [3, 5],
    vx: 160,
    fall: [75, 125],
    sway: 5,
    tilt: false,
  },
  blizzard: {
    count: 340,
    tint: 0xffffff,
    alpha: 1,
    w: [3, 4],
    h: [3, 4],
    vx: 320,
    fall: [95, 150],
    sway: 3,
    tilt: false,
  },
  // Ash drifts down grey and slow over the undead lands.
  ash: {
    count: 210,
    tint: 0xc9c2cf,
    alpha: 0.9,
    w: [2, 4],
    h: [2, 4],
    vx: 140,
    fall: [35, 80],
    sway: 7,
    tilt: false,
  },
  sand: {
    count: 700,
    tint: 0xb87a30,
    alpha: 1,
    w: [1, 2],
    h: [5, 9],
    vx: 320,
    fall: [-2, 2], // blows in from the sides, not down from the sky
    sway: 0,
    tilt: true,
  },
};

/** The colour and strength of the haze over the whole view (strong enough to read against bright ground). */
const HAZE: Partial<Record<Look, { tint: number; alpha: number }>> = {
  rain: { tint: 0x16233a, alpha: 0.24 },
  storm: { tint: 0x0b1224, alpha: 0.3 },
  // Snow has no haze at all (a full-screen layer is the costliest thing here); a blizzard gets a thin cool tint. Weather
  // must not dim the game or slow it down.
  blizzard: { tint: 0x7f93b4, alpha: 0.18 },
  sand: { tint: 0x8a5518, alpha: 0.38 },
  ash: { tint: 0x2c2832, alpha: 0.16 },
};

interface Drop {
  particle: Particle;
  /** Where in the view this drop falls from / enters, as fractions of its width and height. They follow a low-discrepancy
   * sequence by index, so the drops in play (always the first `active`) cover the view evenly instead of clumping. */
  u: number;
  v: number;
  x: number;
  y: number;
  fall: number;
  phase: number;
  sway: number;
}

// The R2 sequence: successive points fill the unit square evenly (no clumps, no gaps), whatever how many are used.
const R2_U = 0.7548776662466927;
const R2_V = 0.5698402909980532;
const frac = (n: number) => n - Math.floor(n);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const between = ([a, b]: [number, number]) => rand(a, b);

export class WeatherLayer {
  readonly view = new Container();
  private haze: Sprite;
  private particles: ParticleContainer;
  private drops: Drop[] = [];
  private active = 0; // drops currently in play (the rest are hidden)
  private look: Look | null = null;
  private clock = 0;
  private flash: Sprite;
  private bolt = new Graphics();
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
    const particles = Array.from(
      { length: POOL },
      () => new Particle({ texture: pixel, anchorX: 0.5, anchorY: 0.5, scaleX: 0, scaleY: 0 }),
    );
    this.particles = new ParticleContainer({
      texture: pixel,
      particles,
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false },
    });
    this.particles.update(); // uploads the static buffers on first render; the pool never changes after this
    this.drops = particles.map((particle, i) => ({
      particle,
      u: frac(0.5 + i * R2_U),
      v: frac(0.5 + i * R2_V),
      x: 0,
      y: 0,
      fall: 0,
      phase: 0,
      sway: 0,
    }));
    this.view.addChild(this.particles, this.flash, this.bolt);
    this.view.zIndex = 1e9 - 1;
    layer.addChild(this.view);
  }

  /** Draw `weather` over `view` (world px). Lightning is decided elsewhere (the simulation) and shown by `strike`. */
  update(dt: number, weather: Weather, view: ViewRect) {
    this.clock += dt;
    const look: Look | null = weather.precip ?? (weather.windLevel > 0 ? 'gust' : null);
    const style = look ? STYLES[look] : undefined;
    if (look !== this.look) {
      this.look = look;
      for (const d of this.drops) d.particle.scaleX = d.particle.scaleY = 0; // nothing of the old weather stays on screen
      this.active = 0; // the pool starts again with the new style
    }

    const haze = look ? HAZE[look] : undefined;
    this.haze.visible = !!haze && weather.intensity > 0;
    if (haze && this.haze.visible) {
      this.haze.tint = haze.tint;
      this.haze.alpha = haze.alpha * weather.intensity;
      this.haze.position.set(view.x, view.y);
      this.haze.width = view.w;
      this.haze.height = view.h;
    }

    this.glow = Math.max(0, this.glow - dt * 3.5);
    this.showFlash(view);

    // A breeze is a few gust streaks; a gale is more of them. Anything falling is at full strength.
    const density = look === 'gust' ? Math.max(0.35, weather.windLevel) : 1;
    const want = style ? Math.min(POOL, Math.round(style.count * density * weather.intensity)) : 0;
    while (this.active < want) this.spawn(this.drops[this.active++]!, style!, view, true);
    while (this.active > want) {
      const d = this.drops[--this.active];
      if (d) d.particle.scaleX = d.particle.scaleY = 0; // hidden: nothing to draw
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
      d.particle.x = d.x + sway;
      d.particle.y = d.y;
      d.particle.rotation = style.tilt ? Math.atan2(-vx, d.fall) : 0;
    }
  }

  /** Put a drop in play: at its own place in the view, or (when it wrapped) on the edge it re-enters from. */
  private spawn(d: Drop, style: Style, view: ViewRect, anywhere: boolean, edge?: 'left' | 'right' | 'top' | 'bottom') {
    d.x = view.x + d.u * view.w;
    d.y = view.y + d.v * view.h;
    if (!anywhere) {
      if (edge === 'left') d.x = view.x - 4;
      else if (edge === 'right') d.x = view.x + view.w + 4;
      else if (edge === 'top') d.y = view.y - 8;
      else d.y = view.y + view.h + 8;
    }
    d.fall = between(style.fall);
    d.phase = rand(0, Math.PI * 2);
    d.sway = style.sway ? rand(style.sway * 0.4, style.sway) : 0;
    const p = d.particle;
    const unit = p.texture.width;
    p.scaleX = between(style.w) / unit;
    p.scaleY = between(style.h) / unit;
    p.tint = style.tint;
    p.alpha = style.alpha * rand(0.7, 1);
  }

  /** Flash the sky and draw a jagged bolt landing at world (x, y); the same seed draws the same bolt everywhere. */
  strike({ x: targetX, y: targetY, seed }: Strike) {
    this.glow = 1;
    const rng = mulberry32(seed);
    const bolt = this.bolt;
    bolt.clear();
    let x = targetX + (rng() - 0.5) * 60;
    let y = targetY - 260;
    const path: [number, number][] = [[x, y]];
    while (y < targetY) {
      y = Math.min(targetY, y + 12 + rng() * 14);
      x += (rng() - 0.5) * 28;
      path.push([y >= targetY ? targetX : x, y]);
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

  private showFlash(view: ViewRect) {
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
