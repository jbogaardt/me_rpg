// Where a sound is heard from: how loud and how far left or right, given what part of the field the player is looking at.
// Pixi-free (cosmetic only: the match never reads it, so lockstep is untouched). `audio.ts` plays what this decides.

/** The visible part of the field, in cells: its centre and half its width and height. */
export interface View {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

export interface Mix {
  /** 0 (silent) to 1 (full). */
  gain: number;
  /** -1 (left ear) to 1 (right ear). */
  pan: number;
}

/** Full volume this far from the middle of the screen (1 is the screen's edge), none from `SILENT` out; smooth between. */
export const NEAR = 0.6;
export const SILENT = 1.8;
/** How far a sound may lean to one side: never hard left or right. */
export const PAN_MAX = 0.8;

/** Loudness and pan of something that happens at a point (cells), for a player looking at `view`. Off-screen action is quieter, far action silent. */
export function mixAt(view: View, x: number, y: number): Mix {
  const dx = (x - view.cx) / view.halfW;
  const dy = (y - view.cy) / view.halfH;
  const d = Math.hypot(dx, dy);
  const t = Math.min(1, Math.max(0, (d - NEAR) / (SILENT - NEAR)));
  return { gain: (1 - t) * (1 - t), pan: Math.max(-1, Math.min(1, dx)) * PAN_MAX };
}

/** What the player did themselves: heard in full whatever part of the field they are looking at. */
export const OWN: Mix = { gain: 1, pan: 0 };

/** Keep the loudest `max` of a tick's sounds of one kind: a hundred swords in one step must not become one wall of noise. */
export function loudest<T extends { gain: number }>(sounds: T[], max: number): T[] {
  return sounds.length <= max ? sounds : [...sounds].sort((a, b) => b.gain - a.gain).slice(0, max);
}

/** A view this many cells across (half width) is the one the loudness is tuned for (a desktop window at the default zoom). */
export const REF_HALF_W = 16;

/** Zoomed far out the field is crowded and far away: a little quieter (never below 0.55); zoomed in, no louder than tuned. */
export function zoomGain(view: View): number {
  return Math.min(1, Math.max(0.55, Math.pow(REF_HALF_W / Math.max(1, view.halfW), 0.4)));
}

/** How tense the music is, 0 calm to 1: it jumps with fighting on screen (`hits` loud blows this tick) or a hurt castle, and falls back slowly. */
export function fightLevel(prev: number, hits: number, castleHurt: boolean): number {
  const now = castleHurt ? 1 : Math.min(1, hits * 0.2);
  return Math.max(now, prev * 0.99); // a tick is 0.05 s: about a 5 s half-life
}

/** The music's low-pass cutoff (Hz): a touch muffled when calm, fully open when fighting. */
export function cutoffOf(level: number): number {
  return 6000 + 12000 * Math.min(1, Math.max(0, level));
}
