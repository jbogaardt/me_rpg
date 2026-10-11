import { Container, Graphics } from 'pixi.js';
import type { WeatherKind } from '../systems/weather';

// A decorative frame around the screen that names the weather: an icon in each corner joined by a glowing line
// (snowflakes for snow, drops for rain, a bolt for storms, dune swirls for sand). Drawn once per kind and size, then
// just moved and faded, so it costs nothing per frame.

type Theme = 'ice' | 'rain' | 'storm' | 'sand';

const THEMES: Partial<Record<WeatherKind, Theme>> = {
  snow: 'ice',
  blizzard: 'ice',
  rain: 'rain',
  storm: 'storm',
  sandstorm: 'sand',
};

const LINE: Record<Theme, { color: number; glow: number }> = {
  ice: { color: 0xe4f2ff, glow: 0x7fb4ff },
  rain: { color: 0xa9ccf5, glow: 0x3a66a8 },
  storm: { color: 0xd6e0ff, glow: 0x4a58c0 },
  sand: { color: 0xe0a050, glow: 0x7a4a14 },
};

const INSET = 19; // world px from the screen edge to the line and the corner icons' centres
const ICON = 16; // corner icon radius

function snowflake(g: Graphics, cx: number, cy: number, r: number, color: number) {
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const dx = Math.cos(a),
      dy = Math.sin(a);
    g.moveTo(cx, cy).lineTo(cx + dx * r, cy + dy * r);
    for (const side of [-1, 1]) {
      const b = a + side * (Math.PI / 3);
      g.moveTo(cx + dx * r * 0.6, cy + dy * r * 0.6).lineTo(
        cx + dx * r * 0.6 + Math.cos(b) * r * 0.35,
        cy + dy * r * 0.6 + Math.sin(b) * r * 0.35,
      );
    }
  }
  g.stroke({ width: 2.5, color, cap: 'round' });
}

function drop(g: Graphics, cx: number, cy: number, r: number, color: number) {
  g.moveTo(cx, cy - r)
    .bezierCurveTo(cx + r * 0.9, cy, cx + r * 0.8, cy + r * 0.85, cx, cy + r * 0.85)
    .bezierCurveTo(cx - r * 0.8, cy + r * 0.85, cx - r * 0.9, cy, cx, cy - r)
    .fill({ color, alpha: 0.9 })
    .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
}

function bolt(g: Graphics, cx: number, cy: number, r: number, color: number) {
  g.poly([
    cx + r * 0.3,
    cy - r,
    cx - r * 0.55,
    cy + r * 0.1,
    cx - r * 0.05,
    cy + r * 0.1,
    cx - r * 0.3,
    cy + r,
    cx + r * 0.6,
    cy - r * 0.25,
    cx + r * 0.1,
    cy - r * 0.25,
  ])
    .fill({ color })
    .stroke({ width: 2, color: 0x4a58c0 });
}

function swirl(g: Graphics, cx: number, cy: number, r: number, color: number) {
  for (const k of [1, 0.65, 0.3]) g.moveTo(cx + r * k, cy).arc(cx, cy, r * k, 0, Math.PI * (1.2 + k * 0.6));
  g.stroke({ width: 2.5, color, cap: 'round' });
}

const ICONS: Record<Theme, (g: Graphics, cx: number, cy: number, r: number, color: number) => void> = {
  ice: snowflake,
  rain: drop,
  storm: bolt,
  sand: swirl,
};

export class WeatherFrame {
  readonly view = new Container();
  private g = new Graphics();
  private key = '';

  constructor() {
    this.view.visible = false;
    this.view.addChild(this.g);
  }

  /** Show the frame for the weather at `intensity` (0 hides it) over the world rect at x, y, w, h. */
  update(kind: WeatherKind, intensity: number, x: number, y: number, w: number, h: number) {
    const theme = THEMES[kind];
    this.view.visible = !!theme && intensity > 0;
    if (!theme || intensity <= 0) return;
    const key = `${theme}:${Math.round(w)}x${Math.round(h)}`;
    if (key !== this.key) {
      this.key = key;
      this.draw(theme, w, h);
    }
    this.view.position.set(x, y);
    this.view.alpha = Math.min(1, intensity);
  }

  private draw(theme: Theme, w: number, h: number) {
    const g = this.g.clear();
    const { color, glow } = LINE[theme];
    const x1 = INSET,
      y1 = INSET,
      x2 = w - INSET,
      y2 = h - INSET;
    g.rect(x1, y1, x2 - x1, y2 - y1).stroke({ width: 8, color: glow, alpha: 0.45 });
    g.rect(x1, y1, x2 - x1, y2 - y1).stroke({ width: 3.5, color });
    // Clear a round patch of line behind each icon so it reads as a medallion.
    for (const [cx, cy] of [
      [x1, y1],
      [x2, y1],
      [x1, y2],
      [x2, y2],
    ] as const) {
      g.circle(cx, cy, ICON + 2)
        .fill({ color: glow, alpha: 0.85 })
        .stroke({ width: 2, color });
      ICONS[theme](g, cx, cy, ICON, color);
    }
  }
}
