// Where an off-screen partner's arrow sits on the screen edge. Pixi-free maths, unit-tested; the DOM is in PartnerArrows.ts.

/** The part of the world on screen (the camera's `ViewRect`). */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An arrow on the screen edge: position in screen px, the angle it points (radians, 0 = right) and the world distance. */
export interface EdgeArrow {
  x: number;
  y: number;
  angle: number;
  dist: number;
}

/**
 * The arrow for a partner at world (wx, wy), or null when they are on screen. The screen is `screenW` x `screenH` px
 * showing `view`; the arrow sits `margin` px inside the edge, on the line from the screen centre to the partner.
 */
export function edgeArrow(
  view: View,
  screenW: number,
  screenH: number,
  wx: number,
  wy: number,
  margin = 28,
): EdgeArrow | null {
  const scale = screenW / view.w;
  const sx = (wx - view.x) * scale;
  const sy = (wy - view.y) * scale;
  if (sx >= 0 && sx <= screenW && sy >= 0 && sy <= screenH) return null;
  const cx = screenW / 2;
  const cy = screenH / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const halfW = Math.max(1, cx - margin);
  const halfH = Math.max(1, cy - margin);
  // Shrink the direction until it just touches the inset rectangle.
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return {
    x: cx + dx * t,
    y: cy + dy * t,
    angle: Math.atan2(dy, dx),
    dist: Math.hypot(wx - (view.x + view.w / 2), wy - (view.y + view.h / 2)),
  };
}

/** The distance as a short label in tiles of `tile` px, e.g. "12". */
export const distanceLabel = (dist: number, tile: number): string => String(Math.max(1, Math.round(dist / tile)));
