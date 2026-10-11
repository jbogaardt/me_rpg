// Smoothing for state that arrives in 20-30 Hz snapshots: a client renders at display rate, so it glides toward
// the host's latest position instead of jumping to it. Pure maths.

export const GLIDE_RATE = 18; // 1/s: closes ~63% of the gap in 55 ms, about two snapshots
export const SNAP_DISTANCE = 64; // px: further than this is a teleport (respawn), not movement

/** Move `current` toward `target`, covering `1 - e^(-rate*dt)` of the gap (frame-rate independent). */
export function approach(current: number, target: number, dt: number, rate = GLIDE_RATE): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Glide a point toward (tx, ty); a jump bigger than `snap` lands immediately. */
export function glide(
  p: { x: number; y: number },
  tx: number,
  ty: number,
  dt: number,
  rate = GLIDE_RATE,
  snap = SNAP_DISTANCE,
) {
  if (Math.hypot(tx - p.x, ty - p.y) > snap) {
    p.x = tx;
    p.y = ty;
    return;
  }
  p.x = approach(p.x, tx, dt, rate);
  p.y = approach(p.y, ty, dt, rate);
}
