// What the HUD shows and when (Pixi-free, unit-tested; layer: core engine, cosmetic, local to each player, nothing is sent).
// The drawing is in hud/Hud.ts (hearts, mana, needs, gold flash) and entities/GuideArrow.ts (the waypoint caption).

/** Every threshold of the quiet HUD, in one place. */
export const HUD_RULES = {
  /** Seconds without a change before the hearts (and the other bars) fade back. */
  idle: 3,
  /** Opacity of a faded bar. */
  dim: 0.35,
  /** At or above this share of HP the hearts may fade. */
  calm: 0.6,
  /** Below this share of HP the hearts stay at full opacity. */
  urgent: 0.4,
  /** Below this share of MP the mana bar stays shown. */
  lowMana: 0.25,
  /** Seconds the gold chip stays after gold changed. */
  goldFlash: 2,
  /** Seconds the hero must stand still before the waypoint caption shows. */
  captionIdle: 1,
  /** Seconds the caption shows when a target is newly active (even while walking). */
  captionNew: 4,
  /** Seconds a fade takes. */
  fade: 0.25,
} as const;

/** Most hearts ever drawn; a bigger HP pool makes each heart worth more. */
export const MAX_HEARTS = 10;
/** HP of one heart at the start (the first hero has 30 HP: three hearts). */
export const HEART_HP = 10;
/** Fill steps in a heart (quarters). */
export const HEART_STEPS = 4;

export interface HeartLayout {
  /** HP one full heart holds: 10, 20, 40, 80... (doubling until at most MAX_HEARTS are needed). */
  per: number;
  /** Hearts drawn (the last holds only the remainder when max HP is not a multiple of `per`). */
  count: number;
}

/** How many hearts, and what each is worth, for a max HP: 10 HP a heart up to 100 HP, then each heart doubles, so a 30 HP hero has 3 hearts and a 400 HP one 10. */
export function heartLayout(maxHp: number): HeartLayout {
  let per = HEART_HP;
  while (Math.ceil(Math.max(1, maxHp) / per) > MAX_HEARTS) per *= 2;
  return { per, count: Math.max(1, Math.ceil(Math.max(1, maxHp) / per)) };
}

/**
 * The quarter steps (0..4) each heart is filled with for `hp` of `maxHp`, rounded up so any HP left shows at least a quarter of
 * the first heart that has some. The last heart is scaled to its own (smaller) capacity.
 */
export function heartFills(hp: number, maxHp: number): number[] {
  const { per, count } = heartLayout(maxHp);
  const left = Math.max(0, Math.min(hp, maxHp));
  const fills: number[] = [];
  for (let i = 0; i < count; i++) {
    const cap = Math.min(per, maxHp - i * per);
    const have = Math.max(0, Math.min(cap, left - i * per));
    fills.push(have <= 0 ? 0 : Math.max(1, Math.ceil((have / cap) * HEART_STEPS - 1e-9)));
  }
  return fills;
}

/** Index of the heart that lost the most when HP fell from `before` to `after` (the one that pops), or -1. */
export function lostHeart(before: number[], after: number[]): number {
  let at = -1;
  for (let i = after.length - 1; i >= 0; i--) {
    if ((before[i] ?? 0) > (after[i] ?? 0)) {
      at = i;
      break;
    }
  }
  return at;
}

/** Seconds since the last change, kept per bar; `changed` resets it. */
export function stepQuiet(quiet: number, dt: number, changed: boolean): number {
  return changed ? 0 : Math.min(quiet + dt, 60);
}

/** Should the hearts be faded: calm (HP at 60% or more) and quiet for `idle` seconds. Between 40% and 60% they stay as they are. */
export function heartsDim(quiet: number, hp: number, maxHp: number): boolean {
  const frac = maxHp > 0 ? hp / maxHp : 1;
  return frac >= HUD_RULES.calm && quiet >= HUD_RULES.idle;
}

/** Mana shows after any spend (or a big gulp), while it is low, and for `idle` seconds after; otherwise it fades. */
export function manaDim(quiet: number, mp: number, maxMp: number): boolean {
  if (maxMp <= 0) return true;
  return mp / maxMp >= HUD_RULES.lowMana && quiet >= HUD_RULES.idle;
}

/** Did the mana change enough to show the bar: any spend, or a rise of a tenth of the pool or more (a potion; the slow regeneration does not count). */
export function manaMoved(before: number, after: number, maxMp: number): boolean {
  return after < before || after - before >= maxMp * 0.1;
}

/** Hunger and thirst fade like mana: shown when low or just topped up (a bite or a drink), never for the slow drain. */
export function needDim(quiet: number, low: boolean): boolean {
  return !low && quiet >= HUD_RULES.idle;
}

/** A need rose by a bite or a drink (not by rounding): 5 points above the `base` it was last compared with. */
export function needMoved(base: number, value: number): boolean {
  return value - base >= 5;
}

/** The value to compare a need with next frame: it follows the slow drain down and only climbs once a rise has counted, so a steady drink is noticed after 5 points. */
export function needBase(base: number, value: number): number {
  return value < base || needMoved(base, value) ? value : base;
}

/** The waypoint caption's state: how long the hero has stood still and how long a newly active target keeps it up. */
export interface CaptionState {
  still: number;
  fresh: number;
  alpha: number;
  /** The target the caption last spoke of ('' none). */
  key: string;
}

export const newCaption = (): CaptionState => ({ still: 0, fresh: 0, alpha: 0, key: '' });

/**
 * One frame of the caption: it is wanted while the hero has stood still for `captionIdle` seconds or for `captionNew` seconds
 * after the target changed, and never while `blocked` (it would sit on a name label); `alpha` eases toward that.
 */
export function stepCaption(s: CaptionState, dt: number, moved: boolean, key: string, blocked: boolean) {
  s.still = moved ? 0 : s.still + dt;
  if (key !== s.key) {
    if (key) s.fresh = HUD_RULES.captionNew;
    s.key = key;
  } else if (s.fresh > 0) s.fresh = Math.max(0, s.fresh - dt);
  const want = key !== '' && !blocked && (s.still >= HUD_RULES.captionIdle || s.fresh > 0);
  const k = dt / HUD_RULES.fade;
  s.alpha = want ? Math.min(1, s.alpha + k) : Math.max(0, s.alpha - k);
}
