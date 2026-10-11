import { BitmapText, Container, Graphics } from 'pixi.js';
import type { Direction } from './Character';

/** A short-lived world visual (slash, projectile, damage number). */
export interface Effect {
  view: Container;
  /** Advance by dt seconds; return false once finished. */
  update(dt: number): boolean;
}

/** Owns active effects: adds their views to a layer and destroys them when they finish. */
export class Effects {
  private list: Effect[] = [];

  constructor(private layer: Container) {}

  add(effect: Effect) {
    this.list.push(effect);
    this.layer.addChild(effect.view);
  }

  update(dt: number) {
    // Updating can add effects (a bolt hit spawns damage / XP / LEVEL UP text), so collect those in a
    // fresh list and keep them, rather than letting the filtered result overwrite them.
    const current = this.list;
    this.list = [];
    const alive = current.filter((e) => {
      if (e.update(dt)) return true;
      e.view.destroy({ children: true }); // views can nest (particle effects); textures are shared, so kept
      return false;
    });
    this.list = alive.concat(this.list);
  }
}

const ANGLE: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

/** A sword arc sweeping across the facing direction, centred at (x, y). */
export function slashEffect(x: number, y: number, dir: Direction): Effect {
  const g = new Graphics({ position: { x, y }, rotation: ANGLE[dir], zIndex: 1e9 });
  const duration = 0.16;
  let t = 0;
  return {
    view: g,
    update(dt) {
      t += dt;
      const p = Math.min(1, t / duration);
      const a0 = -1.1;
      const a1 = a0 + 2.2 * Math.min(1, p * 1.6);
      g.clear()
        .arc(0, 0, 22, a0, a1)
        .stroke({ width: 4, color: 0xffffff, alpha: 1 - p * 0.7 })
        .arc(0, 0, 16, a0, a1)
        .stroke({ width: 2, color: 0x4de3ff, alpha: 0.9 * (1 - p) });
      return t < duration;
    },
  };
}

/**
 * A glowing projectile. `step` is called with its position every frame and returns true when it hit
 * something, which ends it; it also ends after travelling `range` pixels. `onEnd` gets the final position
 * and whether it hit something. `glow` is the colour of the halo (cyan for the hero's Time Bolt).
 */
export function boltEffect(
  x: number,
  y: number,
  vx: number,
  vy: number,
  range: number,
  step: (x: number, y: number) => boolean,
  onEnd?: (x: number, y: number, hit: boolean) => void,
  glow = 0x4de3ff,
): Effect {
  const g = new Graphics({ position: { x, y } })
    .circle(0, 0, 5)
    .fill({ color: glow, alpha: 0.35 })
    .circle(0, 0, 2.5)
    .fill(glow === 0x4de3ff ? 0xe8fdff : 0xfff4ec);
  let travelled = 0;
  let t = 0;
  return {
    view: g,
    update(dt) {
      t += dt;
      g.x += vx * dt;
      g.y += vy * dt;
      travelled += Math.hypot(vx, vy) * dt;
      g.zIndex = g.y + 14; // it flies at chest height; sort by the ground point under it
      g.scale.set(1 + 0.2 * Math.sin(t * 30));
      const hit = travelled < range && step(g.x, g.y);
      const alive = travelled < range && !hit;
      if (!alive) onEnd?.(g.x, g.y, hit);
      return alive;
    },
  };
}

/** A number or word that floats up from (x, y) and fades. */
export function floatText(x: number, y: number, text: string, color: number): Effect {
  // Uses the 'FloatText' bitmap font installed in main.ts: no canvas re-render per number.
  const label = new BitmapText({ text, anchor: 0.5, tint: color, style: { fontFamily: 'FloatText', fontSize: 10 } });
  label.position.set(x, y);
  label.zIndex = 1e9;
  const duration = 0.8;
  let t = 0;
  return {
    view: label,
    update(dt) {
      t += dt;
      label.y = y - 18 * (t / duration);
      label.alpha = Math.min(1, (duration - t) / 0.3);
      return t < duration;
    },
  };
}
