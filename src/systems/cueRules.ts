// Show, don't tell (Pixi-free, tested; core engine, cosmetic, co-op): the rules that turn what happened into a cue the body,
// the effects and the sound carry, where the game once floated a number or a word. `Simulation` and `Visuals` apply them;
// every page plays the same effect events, so a guest sees every cue the host does. Nothing here changes a rule.

import { lowHealth } from './downfall';
import { needLevel, type Needs } from './needs';

// --- A blow's weight ---

export type HitTier = 'graze' | 'solid' | 'heavy';

/** A blow under this share of the foe's health is a graze; from HEAVY_SHARE up, or one that kills, it is heavy. */
export const GRAZE_SHARE = 0.12;
export const HEAVY_SHARE = 0.3;

/** How hard a blow landed on a foe, by the share of the foe's full health it took (a kill is always heavy). */
export function hitTier(damage: number, maxHp: number, killed: boolean): HitTier {
  if (killed) return 'heavy';
  const share = damage / Math.max(1, maxHp);
  return share >= HEAVY_SHARE ? 'heavy' : share < GRAZE_SHARE ? 'graze' : 'solid';
}

/** The spark effect for a tier (the plain `hitSpark` is the solid one, so the effect old pages know is the middle). */
export const HIT_FX = { graze: 'hitGraze', solid: 'hitSpark', heavy: 'hitHeavy' } as const satisfies Record<
  HitTier,
  string
>;

/** A blow on the hero: heavy from a quarter of their full health; every other one is the plain `heroHurt`. */
export const HURT_HEAVY_SHARE = 0.25;
export const hurtFx = (damage: number, maxHp: number): 'heroHurt' | 'heroHurtHeavy' =>
  damage / Math.max(1, maxHp) >= HURT_HEAVY_SHARE ? 'heroHurtHeavy' : 'heroHurt';

// --- Refusals ---

/** Why a refusal happened. Every one is the same cue (`deny`: a red puff, the actor's head-shake and the dull thud). */
export type Refusal = 'noRoom' | 'packFull' | 'locked' | 'noMana' | 'noTarget' | 'nothingToDo' | 'trial';

/** A refusal whose reason the player cannot see for themselves says it once as a passive line; the rest are the cue alone. */
export const REFUSAL_LINE: Partial<Record<Refusal, true>> = { locked: true };

export const refusalFx = (_why: Refusal) => 'deny' as const;

// --- The hero's own body ---

/** The heartbeat (0.5 to 1) of a hero at low health, `clock` seconds in: the screen's red edge and the body's pulse share it. */
export const heartbeat = (clock: number, low: number): number => 0.75 + 0.25 * Math.sin(clock * (4 + 4 * low));

export interface Strain {
  /** The colour the body is washed toward, and how far (0 none, 1 fully). */
  color: number;
  amount: number;
}

export const WOUND_COLOR = 0xff4040;
export const HUNGER_COLOR = 0xd8c070; // sallow
export const THIRST_COLOR = 0x98b0d0; // grey-blue
export const NO_STRAIN: Strain = { color: 0xffffff, amount: 0 };

/**
 * What the hero's body shows of how they are: a red pulse in step with the heartbeat when low on health (the stronger the
 * lower), else a slow sallow or grey-blue wash when hungry or thirsty (stronger when empty). Local to each page's own hero.
 */
export function strainOf(hp: number, maxHp: number, needs: Needs, clock: number): Strain {
  const low = lowHealth(hp, maxHp);
  if (low > 0) {
    const pulse = (heartbeat(clock, low) - 0.5) * 2; // 0..1
    return { color: WOUND_COLOR, amount: 0.15 + 0.4 * low * pulse };
  }
  const food = needLevel(needs.food);
  const water = needLevel(needs.water);
  const worst = food === 'empty' || water === 'empty' ? 'empty' : food === 'low' || water === 'low' ? 'low' : null;
  if (!worst) return NO_STRAIN;
  const slow = (Math.sin(clock * 1.6) + 1) / 2;
  const base = worst === 'empty' ? 0.18 : 0.06;
  return {
    color: food === 'empty' || (food === 'low' && water !== 'empty') ? HUNGER_COLOR : THIRST_COLOR,
    amount: base + base * slow,
  };
}

/** A wilt puff (a few dull drops) leaves a hero who is empty of food or water this often (seconds). */
export const WILT_EVERY = 3.5;
export const wilting = (needs: Needs): boolean =>
  needLevel(needs.food) === 'empty' || needLevel(needs.water) === 'empty';

/** `color` washed toward `wash` by `amount` (0 none, 1 all), channel by channel: how a tinted body shows a strain. */
export function washTint(color: number, wash: number, amount: number): number {
  if (amount <= 0) return color;
  const a = Math.min(1, amount);
  const ch = (shift: number) => {
    const from = (color >> shift) & 0xff;
    const to = (wash >> shift) & 0xff;
    return Math.round(from + (to - from) * a);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
