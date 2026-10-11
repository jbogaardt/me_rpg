import { Container, Graphics, Text } from 'pixi.js';
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
    this.list = this.list.filter((e) => {
      if (e.update(dt)) return true;
      e.view.destroy();
      return false;
    });
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
 * something, which ends it; it also ends after travelling `range` pixels.
 */
export function boltEffect(
  x: number,
  y: number,
  vx: number,
  vy: number,
  range: number,
  step: (x: number, y: number) => boolean,
): Effect {
  const g = new Graphics({ position: { x, y } })
    .circle(0, 0, 5)
    .fill({ color: 0x4de3ff, alpha: 0.35 })
    .circle(0, 0, 2.5)
    .fill(0xe8fdff);
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
      return travelled < range && !step(g.x, g.y);
    },
  };
}

/** A number or word that floats up from (x, y) and fades. */
export function floatText(x: number, y: number, text: string, color: number): Effect {
  const label = new Text({
    text,
    anchor: 0.5,
    resolution: 4, // the world layer is scaled up by the camera zoom
    style: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', fill: color, stroke: { color: 0x000000, width: 3 } },
  });
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
