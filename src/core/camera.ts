import type { Container } from 'pixi.js';

/** The view the game is designed for: the zoom is the largest whole number that still fits this in the window. */
export const DESIGN_W = 640;
export const DESIGN_H = 480;

/** Bounds on the view (world px): it must stay inside them. A side that is absent is free. */
export interface EdgeLimits {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/**
 * Keep a view offset (screen px, as `followOffset` gives it) inside the limits on that axis: `lo` and `hi` are the
 * world px the view's near and far edges may not pass. `screen` is the window size on that axis.
 */
export function limitOffset(offset: number, screen: number, zoom: number, lo?: number, hi?: number): number {
  let o = offset;
  if (hi !== undefined) o = Math.max(o, screen - hi * zoom); // the view's far edge is at -o/zoom + screen/zoom
  if (lo !== undefined) o = Math.min(o, -lo * zoom);
  return Math.round(o);
}

/** Integer zoom keeps pixel art crisp. */
export function pickZoom(screenW: number, screenH: number): number {
  return Math.max(1, Math.floor(Math.min(screenW / DESIGN_W, screenH / DESIGN_H)));
}

/**
 * Where to put the world so `target` (world px) is centred, without showing past the map edge. A map smaller
 * than the screen is centred instead. Everything is in screen px except `target`, which is in world px.
 */
export function followOffset(screen: number, map: number, target: number, zoom: number): number {
  const offset = map <= screen ? (screen - map) / 2 : Math.min(0, Math.max(screen - map, screen / 2 - target * zoom));
  return Math.round(offset);
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

/** Zooms and scrolls a world container to follow a point, clamped to the map. */
export class Camera {
  zoom = 1;
  /** Where the world sits with no door slide applied (screen px): what the view and the map chunks are worked out from. */
  private baseX = 0;
  private baseY = 0;

  constructor(
    private world: Container,
    private mapW: number, // world px
    private mapH: number,
  ) {}

  resize(screenW: number, screenH: number) {
    this.zoom = pickZoom(screenW, screenH);
    this.world.scale.set(this.zoom);
  }

  view(screenW: number, screenH: number): ViewRect {
    return viewRect(screenW, screenH, this.baseX, this.baseY, this.zoom);
  }

  /**
   * Centre on (x, y), clamped to the map and to `limits` (see map/edges.ts: near a gap the view stops at the border, so
   * the player walks to the edge of the screen before the crossing).
   */
  follow(screenW: number, screenH: number, x: number, y: number, limits: EdgeLimits = {}) {
    this.baseX = limitOffset(
      followOffset(screenW, this.mapW * this.zoom, x, this.zoom),
      screenW,
      this.zoom,
      limits.left,
      limits.right,
    );
    this.baseY = limitOffset(
      followOffset(screenH, this.mapH * this.zoom, y, this.zoom),
      screenH,
      this.zoom,
      limits.top,
      limits.bottom,
    );
    this.world.position.set(this.baseX, this.baseY);
  }

  /** Slide the world by this many screen px for this frame (a door slide); `view` ignores it. */
  shift(dx: number, dy: number) {
    this.world.position.set(this.baseX + dx, this.baseY + dy);
  }
}
