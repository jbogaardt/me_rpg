// Slippery ground: on ice a player's velocity eases toward the walking velocity instead of snapping to it, and
// keeps coasting when the keys are let go. Pixi-free so the maths is unit-tested.

import { CELL, type MapData } from '../map/types';

export interface Vec {
  x: number;
  y: number;
}

/** Pixels/s² of grip when steering on ice (walking speed takes about half a second to reach), and of drag when coasting. */
export const ICE_ACCEL = 260;
export const ICE_DRAG = 50;

/** Is the ground under this world point ice? */
export function isIce(data: MapData, x: number, y: number): boolean {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || row < 0 || col >= data.width || row >= data.height) return false;
  const id = data.surface[row * data.width + col];
  return id !== undefined && data.surfaces[id] === 'ice';
}

/**
 * The next velocity. `wish` is the unit direction held (or zero) and `speed` the walking speed. Off ice the
 * walker gets exactly what they ask for; on ice the velocity only changes by `ICE_ACCEL` toward it while a key
 * is held, and by `ICE_DRAG` toward a stop otherwise.
 */
export function stepVelocity(vel: Vec, wish: Vec, speed: number, dt: number, onIce: boolean): Vec {
  const tx = wish.x * speed;
  const ty = wish.y * speed;
  if (!onIce) return { x: tx, y: ty };
  const held = wish.x !== 0 || wish.y !== 0;
  const [ax, ay] = held ? [tx - vel.x, ty - vel.y] : [-vel.x, -vel.y];
  const dist = Math.hypot(ax, ay);
  const step = (held ? ICE_ACCEL : ICE_DRAG) * dt;
  if (dist <= step) return held ? { x: tx, y: ty } : { x: 0, y: 0 };
  return { x: vel.x + (ax / dist) * step, y: vel.y + (ay / dist) * step };
}
