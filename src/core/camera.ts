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
 * Zooms and scrolls a world container to follow a point. The player is in the middle of the screen (a little behind
 * while walking, the camera eases after them) and the view never leaves `bounds`, so outside the zone is never shown
 * and near a wall the player simply walks toward the edge of the screen. One rule, everywhere.
 */
export class Camera {
  zoom = 1;
  /** Where the world sits (screen px) before any `punch`: what the view and the map chunks are worked out from. */
  private baseX = 0;
  private baseY = 0;
  private settled = false;

  constructor(private world: Container) {}

  resize(screenW: number, screenH: number) {
    this.zoom = pickZoom(screenW, screenH);
    this.world.scale.set(this.zoom);
    this.settled = false; // the next follow() puts the view where it belongs at once
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
      this.baseX = Math.round(chase(this.baseX, goalX, FOLLOW_RATE, dt));
      this.baseY = Math.round(chase(this.baseY, goalY, FOLLOW_RATE, dt));
    }
    this.world.scale.set(this.zoom);
    this.world.position.set(this.baseX, this.baseY);
  }

  /**
   * A momentary extra zoom for a transition: the world is scaled by `scale` about the world point (hx, hy) and slid by
   * (dx, dy) screen px, without disturbing the view used for chunks and weather. `punch(1, ...)` is no change.
   */
  punch(scale: number, hx: number, hy: number, dx = 0, dy = 0) {
    const k = this.zoom * (1 - scale);
    this.world.scale.set(this.zoom * scale);
    this.world.position.set(this.baseX + hx * k + dx, this.baseY + hy * k + dy);
  }
}
