import type { Container } from 'pixi.js';

/** The view the game is designed for: the zoom is the largest whole number that still fits this in the window. */
export const DESIGN_W = 640;
export const DESIGN_H = 480;

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
    return viewRect(screenW, screenH, this.world.x, this.world.y, this.zoom);
  }

  follow(screenW: number, screenH: number, x: number, y: number) {
    this.world.position.set(
      followOffset(screenW, this.mapW * this.zoom, x, this.zoom),
      followOffset(screenH, this.mapH * this.zoom, y, this.zoom),
    );
  }
}
