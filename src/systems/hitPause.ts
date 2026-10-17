// Hit-pause and the blink of invulnerability: pure rules (no Pixi). Layer: core engine (combat feel), no capability.
// A landed blow freezes its target for a moment (HIT_PAUSE_MIN..MAX seconds, a bigger blow a longer one) while it flashes,
// then it staggers as usual. The pause is a visual cue only: the host applies it to the mob it simulates, a guest sees
// the mob stop because the host's snapshots stop moving it, so nothing new is sent. The player's i-frames
// (INVULN_TIME, `Player.invuln`) are the host's rule; the blink is derived from the timer, never sent.

export const HIT_PAUSE_MIN = 0.1;
export const HIT_PAUSE_MAX = 0.15;

/** How long a blow freezes its target: 100ms for a scratch up to 150ms for a blow of a third of the target's HP or more. */
export function hitPauseFor(damage: number, maxHp: number): number {
  const share = maxHp > 0 ? Math.min(1, Math.max(0, damage / maxHp) * 3) : 1;
  return HIT_PAUSE_MIN + (HIT_PAUSE_MAX - HIT_PAUSE_MIN) * share;
}

/** Run a pause down by `dt`; returns the time left (never below 0). */
export function tickPause(left: number, dt: number): number {
  return Math.max(0, left - dt);
}

/** True while a player's invulnerability window is open, so a blow or a shot passes through. */
export function isInvulnerable(invuln: number): boolean {
  return invuln > 0;
}

/** The body's alpha while blinking after a hit: 8 flickers a second while invulnerable, solid otherwise. */
export function blinkAlpha(invuln: number): number {
  return invuln > 0 && Math.floor(invuln * 16) % 2 === 0 ? 0.35 : 1;
}
