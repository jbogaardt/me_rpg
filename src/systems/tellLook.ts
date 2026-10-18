// The look of a foe's windup, as pure maths (the drawing is entities/WindupCue.ts and Mob.ts). Every value is a function of
// the windup's progress (0 at the start, 1 at the blow) and its length, so the host, solo and a co-op guest, who all know
// the state and the timer and nothing more, draw the same thing; nothing is allocated.
//
// One danger palette for every damaging cue, whatever the kind: warm red-orange while it builds, near-white at the aim lock
// (the "now" frame). The steps are deliberate (alpha in a few levels, sizes in quarter steps): they are what keeps the cue
// in the pixel-art's own language instead of a smooth vector overlay.

/** Warm red-orange: the whole windup (body flush, marks, edge pulse). */
export const TELL_COLOR = 0xff5a1f;
/** Near-white: the aim-lock flash and the marks once the blow can no longer be turned. */
export const TELL_HOT = 0xfff0d2;
/** The contact shadow's dark red-brown. */
export const TELL_SHADOW = 0x3a0806;
/** What the body is tinted toward while it flushes (a multiply tint cannot brighten, so it warms). */
export const TELL_FLUSH = 0xff7a58;
/** Seconds the lock flash lasts. */
export const LOCK_FLASH = 0.1;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Snap to `steps` levels per unit (4: quarters). */
export const stepped = (v: number, steps: number) => Math.round(v * steps) / steps;

/** How coiled the body is: 0 at the start, 1 at the aim lock (`lockAt` of the way through), held after. */
export function crouch(progress: number, lockAt: number): number {
  const t = clamp01(progress / lockAt);
  return t * t * (3 - 2 * t);
}

/** Body squash (width factor) and (height factor) at coil `c`: it sinks and spreads, as a spring does. */
export const squashX = (c: number) => 1 + 0.06 * c;
export const squashY = (c: number) => 1 - 0.1 * c;
/** Draw-back opposite the way it faces, whole pixels (the sprite stays on the pixel grid). */
export const leanPx = (c: number) => Math.round(5 * c);
/** Pixels of tremble once locked: a coiled body shivers (alternates every 2 frames). */
export const tremblePx = (seconds: number) => (Math.floor(seconds * 30) % 2 === 0 ? 0 : 1);

/** The contact shadow grows in quarter steps (a whole number of pixels on its 28 px sprite), 1 to 1.5. */
export const shadowScale = (progress: number) => stepped(1 + 0.5 * progress, 4);
/** ...and darkens in tenths, from faint to near solid. */
export const shadowAlpha = (progress: number) => stepped(0.3 + 0.5 * progress, 10);

/** How many of `max` ground marks have appeared: none before 10% of the windup, all of them at the lock. */
export function marksShown(progress: number, max: number, lockAt: number): number {
  return Math.min(max, Math.floor(clamp01((progress - 0.08) / (lockAt - 0.08)) * max + 0.999));
}

/** How strongly the body is flushed (0..1): it throbs faster toward the blow, and ends solid. */
export function flush(progress: number, elapsed: number, len: number): number {
  const amp = 0.35 + 0.65 * progress;
  if (progress > 0.85) return 1;
  const phase = Math.PI * 2 * (3 * elapsed + (5 * elapsed * elapsed) / len); // quickens toward the strike
  return Math.sin(phase) > 0 ? amp : amp * 0.35;
}

/** Linear mix of two 0xRRGGBB colours. */
export function mixColor(a: number, b: number, t: number): number {
  const r = (a >> 16) & 255;
  const g = (a >> 8) & 255;
  const bl = a & 255;
  return (
    (Math.round(r + (((b >> 16) & 255) - r) * t) << 16) |
    (Math.round(g + (((b >> 8) & 255) - g) * t) << 8) |
    Math.round(bl + ((b & 255) - bl) * t)
  );
}

/**
 * A ground mark's look: `i` of `n`, `since` seconds after the lock (negative before). Before the lock they sit dim in
 * quarter-step alphas, brightening; the lock flashes them all near-white; after it a melee blow's marks hold hot and
 * flicker, and a line attack (`runner`) sends one bright mark running outward along the line, which is its direction.
 */
export function markLook(
  out: { color: number; alpha: number },
  i: number,
  n: number,
  progress: number,
  since: number,
  runner: boolean,
): void {
  if (since < 0) {
    out.color = TELL_COLOR;
    out.alpha = stepped(0.35 + 0.4 * progress + 0.1 * (i / Math.max(1, n - 1)), 4);
  } else if (since < LOCK_FLASH) {
    out.color = TELL_HOT;
    out.alpha = 1;
  } else if (runner) {
    const lit = Math.floor(since * 16) % (n + 1) === i;
    out.color = lit ? TELL_HOT : TELL_COLOR;
    out.alpha = lit ? 1 : 0.65;
  } else {
    const flick = Math.floor(since * 14) % 2 === 0;
    out.color = flick ? TELL_HOT : mixColor(TELL_COLOR, TELL_HOT, 0.5);
    out.alpha = 0.9;
  }
}

/** Lock sparks: how long they live and how far (px) they fly. */
export const SPARK_LIFE = 0.2;
export const SPARK_FLY = 16;
export const SPARKS = 4;

/** Where spark `i` is, `since` seconds after the lock, as an offset (px, whole) from its start; false once it is gone. */
export function sparkAt(out: { x: number; y: number; alpha: number }, i: number, since: number): boolean {
  if (since < 0 || since > SPARK_LIFE) return false;
  const k = since / SPARK_LIFE;
  const a = (i / SPARKS) * Math.PI * 2 + 0.6; // fixed fan, so every page draws the same sparks
  const d = SPARK_FLY * (1 - (1 - k) * (1 - k));
  out.x = Math.round(Math.cos(a) * d);
  out.y = Math.round(Math.sin(a) * d * 0.7);
  out.alpha = stepped(1 - k, 3);
  return out.alpha > 0;
}
