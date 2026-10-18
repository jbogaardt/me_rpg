import { BitmapText, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Direction } from '../core/direction';
import {
  FACING_ANGLE,
  SLASH_DURATION,
  SLASH_SEGMENTS,
  slashPolygon,
  slashRadius,
  slashShape,
  slashStage,
} from '../systems/slashArc';

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
      e.view.destroy({ children: true, context: true }); // nested views go too (particles); textures are shared, so kept
      return false;
    });
    this.list = alive.concat(this.list);
  }
}

/**
 * A sword's swept crescent centred at (x, y), facing `dir` (`systems/slashArc.ts`: three stages over ~150 ms, tapered
 * tail, sized from the weapon's `reach`). One Graphics and two small polygons, redrawn in place: nothing allocated per frame.
 */
export function slashEffect(x: number, y: number, dir: Direction, accent = 0x4de3ff, reach = 22): Effect {
  const g = new Graphics({ position: { x, y }, zIndex: 1e9 });
  const radius = slashRadius(reach);
  const facing = FACING_ANGLE[dir];
  const outerPoly: number[] = new Array<number>(4 * (SLASH_SEGMENTS + 1)).fill(0);
  const innerPoly: number[] = new Array<number>(4 * (SLASH_SEGMENTS + 1)).fill(0);
  let t = 0;
  return {
    view: g,
    update(dt) {
      t += dt;
      const p = Math.min(1, t / SLASH_DURATION);
      const shape = slashShape(p, radius);
      const strike = slashStage(p) === 1;
      g.clear()
        .poly(slashPolygon(outerPoly, shape, radius, facing))
        .fill({ color: accent, alpha: 0.9 * shape.alpha })
        .poly(slashPolygon(innerPoly, shape, radius, facing, 2))
        .fill({ color: 0xffffff, alpha: (strike ? 1 : 0.8) * shape.alpha });
      return t < SLASH_DURATION;
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

/**
 * An arrow in flight, pointing the way it flies. `step`, `range` and `onEnd` work as for `boltEffect`; an arrow that
 * hit something is gone at once, one that merely ran out of range just drops.
 */
export function arrowEffect(
  x: number,
  y: number,
  vx: number,
  vy: number,
  range: number,
  step: (x: number, y: number) => boolean,
  onEnd?: (x: number, y: number, hit: boolean) => void,
  accent = 0xf4efe4,
): Effect {
  const g = new Graphics({ position: { x, y }, rotation: Math.atan2(vy, vx) })
    .moveTo(-9, 0)
    .lineTo(3, 0)
    .stroke({ width: 1.5, color: 0xb98a55 }) // shaft
    .poly([3, -2, 7, 0, 3, 2])
    .fill(0xe8edf2) // head
    .poly([-9, 0, -12, -2.5, -7, 0, -12, 2.5])
    .fill(accent); // fletching (the owner's colour in co-op)
  let travelled = 0;
  return {
    view: g,
    update(dt) {
      g.x += vx * dt;
      g.y += vy * dt;
      travelled += Math.hypot(vx, vy) * dt;
      g.zIndex = g.y + 14; // it flies at chest height, like the bolt
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

/** The colours of the motes a kill pays: coins, then the XP sparks. */
export const GAIN_MOTE_COLORS = [0xffd34a, 0xffe9a8, 0xffb13f, 0xffffff, 0xffd34a, 0xffb13f];
export const MOTE_FLIGHT = 0.42;
export const MOTE_STAGGER = 0.05;

/**
 * Coins and sparks that arc from where something paid out (a foe, a task) to the hero that earned it: `target` is asked
 * for the hero's chest each frame (null once the hero is gone: the motes just end). One Graphics redrawn in place, at most
 * a handful of 3 px squares, each flying a quadratic curve that bows upward, so the pay reads as flying to the hero.
 */
export function moteArc(
  x: number,
  y: number,
  target: () => { x: number; y: number } | null,
  colors: readonly number[] = GAIN_MOTE_COLORS,
): Effect {
  const g = new Graphics({ zIndex: 1e9 });
  const bow = colors.map((_, i) => -26 - ((i * 7) % 14)); // how high each one lifts before it comes in
  const side = colors.map((_, i) => ((i % 3) - 1) * 14); // and how far it swings out
  let t = 0;
  return {
    view: g,
    update(dt) {
      t += dt;
      const end = target();
      g.clear();
      if (!end) return false;
      let flying = false;
      for (let i = 0; i < colors.length; i++) {
        const k = (t - i * MOTE_STAGGER) / MOTE_FLIGHT;
        if (k >= 1) continue;
        flying = true;
        if (k < 0) continue;
        const e = k * k * (3 - 2 * k); // ease in and out
        const mx = (x + end.x) / 2 + (side[i] ?? 0);
        const my = Math.min(y, end.y) + (bow[i] ?? -30);
        const u = 1 - e;
        const px = u * u * x + 2 * u * e * mx + e * e * end.x;
        const py = u * u * y + 2 * u * e * my + e * e * end.y;
        g.rect(Math.round(px) - 1, Math.round(py) - 1, 3, 3).fill({
          color: colors[i] ?? 0xffd34a,
          alpha: k > 0.85 ? (1 - k) / 0.15 : 1,
        });
      }
      return flying;
    },
  };
}

const GHOST_LIFE = 0.28;

/**
 * A fading copy of a body's frame left a few pixels behind it (a dodge): pale blue, half see-through, it slides on in the
 * way the body went and is gone in `GHOST_LIFE`. One Sprite, no allocation per frame.
 */
export function afterimage(
  frame: { texture: Texture; anchorY: number; scale: number },
  x: number,
  y: number,
  dx: number,
  dy: number,
): Effect {
  const sprite = new Sprite({ texture: frame.texture, tint: 0xbfe3ff, alpha: 0.55 });
  sprite.anchor.set(0.5, frame.anchorY);
  sprite.scale.set(frame.scale);
  sprite.position.set(x, y);
  sprite.zIndex = y - 0.5; // just behind the body that left it
  let t = 0;
  return {
    view: sprite,
    update(dt) {
      t += dt;
      const k = Math.min(1, t / GHOST_LIFE);
      sprite.x = x + dx * k * 8;
      sprite.y = y + dy * k * 8;
      sprite.alpha = 0.55 * (1 - k);
      return k < 1;
    },
  };
}
