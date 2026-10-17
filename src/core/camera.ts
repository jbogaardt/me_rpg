import type { Container } from 'pixi.js';

/**
 * The view the game is designed for: the zoom is the whole number that brings the window closest to this (rounded, so a
 * window a little under a size still gets the bigger picture), never below 1.
 */
export const DESIGN_W = 640;
export const DESIGN_H = 440;

/** Integer zoom keeps pixel art crisp. */
export function pickZoom(screenW: number, screenH: number): number {
  return Math.max(1, Math.round(Math.min(screenW / DESIGN_W, screenH / DESIGN_H)));
}

/** The rectangle of the world (px) the camera is allowed to show: the zone itself, nothing of its neighbours. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where to put the world on one axis (screen px) so `target` (world px) is in the middle of the screen, without showing
 * past `lo`..`hi` (world px). A span smaller than the screen is centred instead. Whole numbers: the art stays crisp.
 */
export function followOffset(screen: number, lo: number, hi: number, target: number, zoom: number): number {
  const span = (hi - lo) * zoom;
  if (span <= screen) return Math.round((screen - (lo + hi) * zoom) / 2);
  const offset = screen / 2 - target * zoom;
  return Math.round(Math.min(-lo * zoom, Math.max(screen - hi * zoom, offset)));
}

/** A rectangle in world px. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of the world on screen, given the world container's screen offset and zoom. */
export function viewRect(screenW: number, screenH: number, offsetX: number, offsetY: number, zoom: number): ViewRect {
  return { x: -offsetX / zoom, y: -offsetY / zoom, w: screenW / zoom, h: screenH / zoom };
}

/** Move `from` toward `to` by a share that depends on time, not on the frame rate (`rate` per second: higher is snappier). */
export function chase(from: number, to: number, rate: number, dt: number): number {
  return from + (to - from) * (1 - Math.exp(-rate * dt));
}

/** How quickly the camera catches up with the player (per second): a soft, short trail behind a walking hero. */
export const FOLLOW_RATE = 9;

/**
 * One whole-pixel step of the follow ease. Rounding alone stalls the camera a few px short of the goal (the step rounds
 * to 0), and the next snap (a resize, a layout pass) then shows as a jump; so it always moves at least 1px and lands exactly.
 */
function ease(from: number, goal: number, dt: number): number {
  const next = Math.round(chase(from, goal, FOLLOW_RATE, dt));
  if (next !== from || from === goal) return next;
  return from + Math.sign(goal - from);
}

/** The widest a camera shake swings (screen px) at full strength. */
export const SHAKE_PX = 8;

/**
 * Where a shake `t` seconds in sits (screen px): a quick wobble that fades to nothing at `duration`. Whole pixels, so the
 * art stays crisp.
 */
export function shakeOffset(t: number, duration: number, amplitude: number): { x: number; y: number } {
  if (duration <= 0 || t >= duration || amplitude <= 0) return { x: 0, y: 0 };
  const fade = 1 - t / duration;
  return {
    x: Math.round(Math.sin(t * 61) * amplitude * fade),
    y: Math.round(Math.cos(t * 47 + 1.3) * amplitude * fade),
  };
}

/**
 * Zooms and scrolls a world container to follow a point. The player is in the middle of the screen (a little behind
 * while walking, the camera eases after them) and the view never leaves `bounds` (the map). One rule, everywhere.
 */
export class Camera {
  zoom = 1;
  /** Where the world sits (screen px) before any `punch`: what the view and the map chunks are worked out from. */
  private baseX = 0;
  private baseY = 0;
  private settled = false;
  /** A shake in progress (a director's cue, `systems/cues.ts`): seconds in, its length and its swing in screen px. */
  private rattle: { t: number; duration: number; amplitude: number } | null = null;
  private shaken = { x: 0, y: 0 };

  constructor(private world: Container) {}

  resize(screenW: number, screenH: number) {
    const zoom = pickZoom(screenW, screenH);
    if (zoom !== this.zoom) this.settled = false; // the next follow() puts the view where it belongs at once
    this.zoom = zoom;
    this.world.scale.set(this.zoom);
  }

  /** Shake the view for `seconds` at `strength` 0 to 1; a shake already running is only replaced by a stronger one. */
  shake(strength: number, seconds: number) {
    const amplitude = Math.max(0, Math.min(1, strength)) * SHAKE_PX;
    const now = this.rattle;
    if (amplitude <= 0 || seconds <= 0) return;
    if (now && now.t < now.duration && now.amplitude * (1 - now.t / now.duration) > amplitude) return;
    this.rattle = { t: 0, duration: seconds, amplitude };
  }

  /** Advance the shake `dt` seconds and keep where it puts the view now. */
  private shakeStep(dt: number) {
    const r = this.rattle;
    if (!r) return;
    r.t += dt;
    this.shaken = shakeOffset(r.t, r.duration, r.amplitude);
    if (r.t >= r.duration) this.rattle = null;
  }

  /** Where the world sits (screen px) before any `punch`. */
  get base(): { x: number; y: number } {
    return { x: this.baseX, y: this.baseY };
  }

  /** Put the world exactly here (screen px), as when another zone's view takes over from one it was laid beside. */
  adopt(x: number, y: number) {
    this.baseX = x;
    this.baseY = y;
    this.settled = true;
    this.world.scale.set(this.zoom);
    this.world.position.set(x, y);
  }

  view(screenW: number, screenH: number): ViewRect {
    return viewRect(screenW, screenH, this.baseX, this.baseY, this.zoom);
  }

  /**
   * Follow (x, y) inside `bounds`. `dt` eases the view toward the player; `snap` (or the first call) puts it there at
   * once, as when a zone is shown or the window is resized.
   */
  follow(screenW: number, screenH: number, x: number, y: number, bounds: Bounds, dt = 0, snap = false) {
    const goalX = followOffset(screenW, bounds.left, bounds.right, x, this.zoom);
    const goalY = followOffset(screenH, bounds.top, bounds.bottom, y, this.zoom);
    if (snap || !this.settled || dt <= 0) {
      this.baseX = goalX;
      this.baseY = goalY;
      this.settled = true;
    } else {
      this.baseX = ease(this.baseX, goalX, dt);
      this.baseY = ease(this.baseY, goalY, dt);
    }
    this.shakeStep(dt);
    this.world.scale.set(this.zoom);
    this.world.position.set(this.baseX + this.shaken.x, this.baseY + this.shaken.y);
  }

  /**
   * A momentary extra zoom for a transition: the world is scaled by `scale` about the world point (hx, hy) and slid by
   * (dx, dy) screen px, without disturbing the view used for chunks and weather. `punch(1, ...)` is no change.
   */
  punch(scale: number, hx: number, hy: number, dx = 0, dy = 0) {
    const k = this.zoom * (1 - scale);
    this.world.scale.set(this.zoom * scale);
    this.world.position.set(this.baseX + hx * k + dx + this.shaken.x, this.baseY + hy * k + dy + this.shaken.y);
  }
}
