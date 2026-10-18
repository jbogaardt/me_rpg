// The edge threat pulse's maths: which off-screen shooters get a pulse, where it sits on the screen edge (kept clear of
// the HUD and the touch controls) and how it brightens toward the strike. Pixi-free and allocation-free, unit-tested;
// the drawing is in ThreatPulses.ts.
import { edgeArrowInto, type EdgeArrow, type View } from './edgeArrow';

/** A shooter in windup, as `Mob.shooterTell` reports it. `id` keeps a pulse on the same mob from frame to frame. */
export interface Threat {
  id: number;
  x: number;
  y: number;
  color: number;
  /** 0 at the start of the windup, 1 at the strike. */
  progress: number;
}

/** A pulse to draw: screen position, the angle toward the shooter (radians, 0 = right) and its windup progress. */
export interface Pulse {
  id: number;
  x: number;
  y: number;
  angle: number;
  color: number;
  progress: number;
  dist: number;
}

export const MAX_PULSES = 3;
/** How far inside the screen edge the pulse's centre sits (px). */
export const EDGE_MARGIN = 18;

export const newThreat = (): Threat => ({ id: 0, x: 0, y: 0, color: 0xffffff, progress: 0 });
export const newPulse = (): Pulse => ({ id: 0, x: 0, y: 0, angle: 0, color: 0xffffff, progress: 0, dist: 0 });

const scratch: EdgeArrow = { x: 0, y: 0, angle: 0, dist: 0 };

/**
 * Pick the pulses for this frame into `out` (preallocated, length >= `max`): of the first `count` of `threats`, those
 * whose shooter is off screen, the soonest to strike first (then the nearest), at most `max`. Returns how many.
 * An on-screen shooter never gets one: its lane and glow are in the world already.
 */
export function pickPulses(
  out: Pulse[],
  threats: Threat[],
  count: number,
  view: View,
  screenW: number,
  screenH: number,
  max = MAX_PULSES,
): number {
  let n = 0;
  const cap = Math.min(max, out.length);
  for (let i = 0; i < count; i++) {
    const t = threats[i]!;
    if (!edgeArrowInto(scratch, view, screenW, screenH, t.x, t.y, EDGE_MARGIN)) continue;
    // Insertion position by (time left, distance): the soonest strike is the most urgent.
    const left = 1 - t.progress;
    let at = n;
    while (at > 0) {
      const o = out[at - 1]!;
      const oLeft = 1 - o.progress;
      if (oLeft < left || (oLeft === left && o.dist <= scratch.dist)) break;
      at--;
    }
    if (at >= cap) continue;
    // Shift the later ones down (the last falls off when full) by swapping objects, so nothing is allocated.
    const last = Math.min(n, cap - 1);
    const spare = out[last]!;
    for (let j = last; j > at; j--) out[j] = out[j - 1]!;
    out[at] = spare;
    spare.id = t.id;
    spare.x = scratch.x;
    spare.y = scratch.y;
    spare.angle = scratch.angle;
    spare.dist = scratch.dist;
    spare.color = t.color;
    spare.progress = t.progress;
    if (n < cap) n++;
  }
  return n;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rects: Rect[] = [
  { x: 0, y: 0, w: 0, h: 0 },
  { x: 0, y: 0, w: 0, h: 0 },
  { x: 0, y: 0, w: 0, h: 0 },
  { x: 0, y: 0, w: 0, h: 0 },
  { x: 0, y: 0, w: 0, h: 0 },
];
const set = (r: Rect, x: number, y: number, w: number, h: number) => {
  r.x = x;
  r.y = y;
  r.w = w;
  r.h = h;
};

/** The HUD bars along the top, the item button and (touch) the stick and A button at the bottom. */
const HUD_TOP = 58;
const PAD = 14; // a pulse is about this big: its whole body clears the rectangle, not only its centre

/**
 * Move a pulse that would sit under the HUD or the on-screen controls to the nearest free spot on the same screen
 * (rectangles mirror ui.css: `#hud`, `#item-btn`, `#dpad`, `#buttons`, `#btn-roll`). Only the position moves; the angle still points at the shooter.
 */
export function keepClear(p: { x: number; y: number }, screenW: number, screenH: number, touch: boolean): void {
  set(rects[0]!, 0, 0, screenW, HUD_TOP);
  // The quick-item button (ui.css `#item-btn`, 60 px plus its pips): up-left of A on touch, in the corner on desktop.
  if (touch) set(rects[1]!, screenW - 172, screenH - 176, 60, 70);
  else set(rects[1]!, screenW - 84, screenH - 88, 60, 70);
  if (touch) {
    set(rects[2]!, 0, screenH - 172, 172, 172);
    set(rects[3]!, screenW - 132, screenH - 172, 132, 172);
    // The dodge roll button (ui.css `#btn-roll`, 60 px, 12 px left of A, 36 px up from the bottom).
    set(rects[4]!, screenW - 180, screenH - 96, 60, 60);
  } else {
    set(rects[2]!, 0, 0, 0, 0);
    set(rects[3]!, 0, 0, 0, 0);
    set(rects[4]!, 0, 0, 0, 0);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const r of rects) {
      if (r.w === 0) continue;
      if (p.x < r.x - PAD || p.x > r.x + r.w + PAD || p.y < r.y - PAD || p.y > r.y + r.h + PAD) continue;
      const toTop = p.y - (r.y - PAD);
      const toBottom = r.y + r.h + PAD - p.y;
      const toLeft = p.x - (r.x - PAD);
      const toRight = r.x + r.w + PAD - p.x;
      // Leave through the nearest side that is not the screen's own edge (a rect flush with an edge cannot be left that way).
      const sides: [number, boolean][] = [
        [r.y <= 0 ? Infinity : toTop, true],
        [r.y + r.h >= screenH ? Infinity : toBottom, true],
        [r.x <= 0 ? Infinity : toLeft, false],
        [r.x + r.w >= screenW ? Infinity : toRight, false],
      ];
      let best = 0;
      for (let i = 1; i < 4; i++) if (sides[i]![0] < sides[best]![0]) best = i;
      if (best === 0) p.y = r.y - PAD;
      else if (best === 1) p.y = r.y + r.h + PAD;
      else if (best === 2) p.x = r.x - PAD;
      else p.x = r.x + r.w + PAD;
    }
  }
}

/** Opacity: brightens toward the strike and goes solid for the last 15% (like the lane's solid edge), blinking before. */
export function pulseAlpha(progress: number, seconds: number): number {
  if (progress > 0.85) return 1;
  const blink = 0.75 + 0.25 * Math.sin(Math.PI * 2 * seconds * (3 + 5 * progress));
  return (0.3 + 0.6 * progress) * blink;
}

/** Size factor: the chevron closes from 1.6 down to 1 as the strike nears (it reads as "now" when it is small and sharp). */
export const pulseScale = (progress: number): number => 1.6 - 0.6 * Math.min(1, Math.max(0, progress));
