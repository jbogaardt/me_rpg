// Roaming people (Pixi-free, tested): a person a scenario placed who strolls about their post instead of standing still,
// so a town feels lived in. Core engine behaviour gated by the `roaming` capability (systems/capabilities.ts); which
// people roam, and how far, is content (`EntityDef.roam`, a radius in cells). The host (or solo) steps it each frame; a
// guest is only told where they stand (`SnapMsg.folk`).
//
// A roamer idles at its post for a few seconds, picks a spot within `radius` of the post, walks there a step at a time
// (the caller's `canMove` says whether a step is open: walls, other people and the players block it, so it never walks
// through anything, and a blocked step just ends the walk), idles again. Being talked to holds it still (`holdRoamer`);
// when the hold runs out it walks back to its post before roaming again. It never leaves the radius around its post, so
// a person who matters is still where the player expects. Quest givers and shopkeepers are placed by the map, not by a
// scenario, and never roam.

import type { Direction } from '../core/direction';
import { DIRS, directionToward } from '../core/direction';
import { CELL } from '../map/types';

export const ROAM_SPEED = 26; // pixels per second: a stroll, slower than the hero
export const ROAM_IDLE: readonly [number, number] = [2, 6]; // seconds standing between strolls
export const ROAM_HOLD = 2.5; // seconds a person stays put after being talked to, before heading home
/** The largest radius content may ask for, in cells: a person strolls about their post, they do not wander off. */
export const MAX_ROAM_CELLS = 8;

export type RoamMode = 'idle' | 'walk' | 'hold' | 'home';

export interface Roamer {
  x: number;
  y: number;
  readonly homeX: number;
  readonly homeY: number;
  /** How far from the post (pixels) a stroll may reach. */
  readonly radius: number;
  mode: RoamMode;
  /** Seconds left of an idle or a hold. */
  wait: number;
  targetX: number;
  targetY: number;
  facing: Direction;
}

/** What a step is asked: a random source, and whether a body may stand at a spot (collision, other bodies). */
export interface RoamEnv {
  rnd: () => number;
  canMove: (x: number, y: number) => boolean;
}

export function newRoamer(x: number, y: number, radiusCells: number, facing: Direction = 'down'): Roamer {
  return {
    x,
    y,
    homeX: x,
    homeY: y,
    radius: Math.min(Math.max(radiusCells, 0), MAX_ROAM_CELLS) * CELL,
    mode: 'idle',
    wait: ROAM_IDLE[0],
    targetX: x,
    targetY: y,
    facing,
  };
}

const idleFor = (rnd: () => number) => ROAM_IDLE[0] + rnd() * (ROAM_IDLE[1] - ROAM_IDLE[0]);

/** Someone talked to them: stand still facing the speaker, then (when the hold ends) go home. */
export function holdRoamer(r: Roamer, towardX: number, towardY: number, seconds = ROAM_HOLD) {
  r.mode = 'hold';
  r.wait = seconds;
  r.facing = directionToward(towardX - r.x, towardY - r.y);
}

/** A spot within the radius of the post, tried a few times until one is open; null when none was. */
export function pickStroll(r: Roamer, env: RoamEnv): { x: number; y: number } | null {
  for (let i = 0; i < 6; i++) {
    const angle = env.rnd() * Math.PI * 2;
    const far = (0.3 + 0.7 * env.rnd()) * r.radius;
    const x = r.homeX + Math.cos(angle) * far;
    const y = r.homeY + Math.sin(angle) * far;
    if (Math.hypot(x - r.x, y - r.y) > 6 && env.canMove(x, y)) return { x, y };
  }
  return null;
}

/**
 * Advance one frame. Returns whether the person moved (for the walk animation). Mutates `r`. Only ever moves to a spot
 * `env.canMove` accepts, so it cannot leave the map or pass through a body, and stays within `radius` of the post
 * (strolls are picked inside it and a walk is a straight line to the target).
 */
export function stepRoamer(r: Roamer, dt: number, env: RoamEnv): boolean {
  if (r.radius <= 0) return false;
  if (r.mode === 'hold' || r.mode === 'idle') {
    r.wait -= dt;
    if (r.wait > 0) return false;
    if (r.mode === 'hold') {
      r.mode = 'home'; // back to the post first
      r.targetX = r.homeX;
      r.targetY = r.homeY;
    } else {
      const spot = pickStroll(r, env);
      if (!spot) {
        r.wait = idleFor(env.rnd);
        return false;
      }
      r.mode = 'walk';
      r.targetX = spot.x;
      r.targetY = spot.y;
    }
  }
  // walk or home: one step toward the target
  const dx = r.targetX - r.x;
  const dy = r.targetY - r.y;
  const dist = Math.hypot(dx, dy);
  const stride = ROAM_SPEED * dt;
  if (dist <= Math.max(stride, 1)) {
    r.mode = 'idle';
    r.wait = idleFor(env.rnd);
    return false;
  }
  const nx = r.x + (dx / dist) * stride;
  const ny = r.y + (dy / dist) * stride;
  // slide along an axis if the straight step is blocked, so a person passes a corner instead of stopping at it
  const step = env.canMove(nx, ny)
    ? [nx, ny]
    : env.canMove(nx, r.y)
      ? [nx, r.y]
      : env.canMove(r.x, ny)
        ? [r.x, ny]
        : null;
  if (!step) {
    // blocked (a wall, a person, the hero): give up this walk and breathe; the next stroll is picked from here
    r.mode = 'idle';
    r.wait = 0.8 + env.rnd();
    return false;
  }
  r.facing = directionToward(step[0]! - r.x, step[1]! - r.y);
  r.x = step[0]!;
  r.y = step[1]!;
  return true;
}

/** The most roaming people one zone may tell a guest about (`SnapMsg.folk`). */
export const MAX_FOLK_WIRE = 32;

/** Where the roaming people stand, flat for `SnapMsg.folk`: x, y (whole pixels) and a facing index (`DIRS`), each. */
export function folkWire(people: readonly { x: number; y: number; facing: Direction }[]): number[] {
  return people
    .slice(0, MAX_FOLK_WIRE)
    .flatMap((p) => [Math.round(p.x), Math.round(p.y), Math.max(0, DIRS.indexOf(p.facing))]);
}

export function folkFromWire(wire: readonly number[] | undefined): { x: number; y: number; facing: Direction }[] {
  const out: { x: number; y: number; facing: Direction }[] = [];
  for (let i = 0; i + 2 < (wire?.length ?? 0); i += 3)
    out.push({ x: wire![i]!, y: wire![i + 1]!, facing: DIRS[wire![i + 2]!] ?? 'down' });
  return out;
}

/** Is this a well-formed `SnapMsg.folk` (groups of three: x, y, a facing index)? */
export function validFolkWire(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length % 3 === 0 &&
    v.length <= MAX_FOLK_WIRE * 3 &&
    v.every(
      (n: unknown, i) =>
        Number.isInteger(n) &&
        (i % 3 === 2 ? (n as number) >= 0 && (n as number) < DIRS.length : Math.abs(n as number) <= 1e6),
    )
  );
}
