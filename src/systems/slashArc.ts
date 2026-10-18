// The sword's swept crescent (Pixi-free maths; `entities/effects.ts` draws it). A swing is ~150 ms in three stages: the
// blade sweeps in (the head runs across the arc while a tapered tail trails it), the strike (the whole crescent at full
// brightness), then the smear (the tail catches the head and the arc fades). It is built in the facing's own frame
// (0 = straight ahead) and rotated to the facing, so one shape serves all four facings and any angle the swing is given.

import type { Direction } from '../core/direction';

/** Seconds the whole arc lives (the brief says 120-180 ms). */
export const SLASH_DURATION = 0.15;
/** Points along each edge of the crescent: the polygon has 2 * (SLASH_SEGMENTS + 1) vertices, drawn once per frame. */
export const SLASH_SEGMENTS = 10;
/** Half the swept angle (radians): the blade crosses about 115 degrees in front of the hero. */
const HALF_SPAN = 1.0;
/** How much of the sweep the tail trails behind the head while the blade is still moving (radians). */
const TRAIL = 1.5;
/** Stage boundaries as a fraction of the duration. */
export const STAGE_SWEEP = 0.4;
export const STAGE_STRIKE = 0.7;

/** The angle a facing points at, radians (0 = right, screen y down). */
export const FACING_ANGLE: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

/** Which of the three stages `p` (0..1 of the duration) is in: 0 sweep, 1 strike, 2 smear. */
export function slashStage(p: number): 0 | 1 | 2 {
  return p < STAGE_SWEEP ? 0 : p < STAGE_STRIKE ? 1 : 2;
}

/** Outer radius of the crescent from the swing's centre, given the weapon's reach (the hit circle's radius). */
export function slashRadius(reach: number): number {
  return reach + 16;
}

export interface SlashShape {
  /** Head and tail angles in the facing's frame (head leads, tail >= -HALF_SPAN). */
  head: number;
  tail: number;
  /** Greatest thickness of the crescent at the head, px. */
  width: number;
  /** 0..1 */
  alpha: number;
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

/** The crescent at progress `p` (0..1), for a blade whose outer radius is `radius`. */
export function slashShape(p: number, radius: number): SlashShape {
  const q = Math.min(1, Math.max(0, p));
  const head = -HALF_SPAN + 2 * HALF_SPAN * easeOut(Math.min(1, q / STAGE_SWEEP));
  // After the sweep the tail closes on the head, which is the smear.
  const close = q <= STAGE_SWEEP ? 0 : (q - STAGE_SWEEP) / (1 - STAGE_SWEEP);
  const tail = Math.max(-HALF_SPAN, head - TRAIL) + (head - Math.max(-HALF_SPAN, head - TRAIL)) * close;
  const width = radius * 0.42 * (q < STAGE_STRIKE ? 1 : 1 - (q - STAGE_STRIKE) / (1 - STAGE_STRIKE) / 2);
  const alpha = q < STAGE_STRIKE ? 1 : 1 - (q - STAGE_STRIKE) / (1 - STAGE_STRIKE);
  return { head, tail, width, alpha };
}

/**
 * Fill `out` (length 4 * (SLASH_SEGMENTS + 1)) with the crescent's polygon, x,y pairs: the outer edge tail to head, then
 * the inner edge head to tail. The thickness grows from nothing at the tail to `shape.width` at the head, so the trail
 * tapers to a point. `facing` is the facing angle (see `FACING_ANGLE`). No allocation.
 */
export function slashPolygon(out: number[], shape: SlashShape, radius: number, facing: number, inset = 0): number[] {
  const n = SLASH_SEGMENTS;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = facing + shape.tail + (shape.head - shape.tail) * u;
    const outer = radius - inset;
    const inner = Math.max(0, outer - shape.width * u * (1 - inset / radius));
    out[i * 2] = Math.cos(a) * outer;
    out[i * 2 + 1] = Math.sin(a) * outer;
    const j = 2 * n + 1 - i; // the inner edge runs back from head to tail
    out[j * 2] = Math.cos(a) * inner;
    out[j * 2 + 1] = Math.sin(a) * inner;
  }
  return out;
}
