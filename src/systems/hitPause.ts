// Hit-pause and the blink of invulnerability: pure rules (no Pixi). Layer: core engine (combat feel), no capability.
// A landed blow freezes its target for a moment (HIT_PAUSE_MIN..MAX seconds, a bigger blow a longer one) while it flashes,
// then it staggers as usual. The pause is a visual cue only: the host applies it to the mob it simulates, a guest sees
// the mob stop because the host's snapshots stop moving it, so nothing new is sent. The hero who lands the blow holds
// too (HERO_*: a beat on a hit, longer on a kill, longest on a boss), and so does a hero who is struck: per actor, never a
// world freeze, and cooldowns keep running through it so balance is untouched. The player's i-frames
// (INVULN_TIME, `Player.invuln`) are the host's rule; the blink is derived from the timer, never sent.

export const HIT_PAUSE_MIN = 0.1;
export const HIT_PAUSE_MAX = 0.15;

/** How long a blow freezes its target: 100ms for a scratch up to 150ms for a blow of a third of the target's HP or more. */
export function hitPauseFor(damage: number, maxHp: number): number {
  const share = maxHp > 0 ? Math.min(1, Math.max(0, damage / maxHp) * 3) : 1;
  return HIT_PAUSE_MIN + (HIT_PAUSE_MAX - HIT_PAUSE_MIN) * share;
}

/** The attacker's own hold on a landed blow: 50ms for a scratch up to 70ms for a big one. */
export const HERO_PAUSE_MIN = 0.05;
export const HERO_PAUSE_MAX = 0.07;
/** A kill holds both the hero and the killed foe this long (a boss or a named foe: the longer one). */
export const KILL_PAUSE = 0.11;
export const BOSS_KILL_PAUSE = 0.2;
/** A hero who is struck holds this long (the knock still carries them). */
export const HERO_HURT_PAUSE = 0.08;

/** How long the hero who landed a blow holds: by the blow's share of the target's HP, longer on a kill, longest on a boss's. */
export function heroPauseFor(damage: number, maxHp: number, killed: boolean, boss: boolean): number {
  if (killed) return killPauseFor(boss);
  const share = maxHp > 0 ? Math.min(1, Math.max(0, damage / maxHp) * 3) : 1;
  return HERO_PAUSE_MIN + (HERO_PAUSE_MAX - HERO_PAUSE_MIN) * share;
}

/** The hold on a kill (the killed foe and the killer both). */
export function killPauseFor(boss: boolean): number {
  return boss ? BOSS_KILL_PAUSE : KILL_PAUSE;
}

/** Foe knockback speeds (px/s): with the decay of 12 a second below, a blow carries about speed/12 px (320 is ~30 px). */
export const KNOCK_SPEED = 320;
export const KNOCK_SHOVE = 90; // a foe that is poised or committed to its windup is only nudged
export const KNOCK_NUDGE = 30; // a foe with poise that is hit but not broken is barely moved: it keeps coming
export const KNOCK_DECAY = 12;
export const KNOCK_CAP = 520; // a bolt's stronger shove is capped so nothing is flung across the screen

/** The velocity of a knock along (vx, vy) at `speed`, its length never past KNOCK_CAP. */
export function knockVelocity(vx: number, vy: number, speed: number): { x: number; y: number } {
  const x = vx * speed;
  const y = vy * speed;
  const len = Math.hypot(x, y);
  const k = len > KNOCK_CAP ? KNOCK_CAP / len : 1;
  return { x: x * k, y: y * k };
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
