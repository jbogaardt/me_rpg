// How a tough foe holds its ground (Pixi-free, tested; core engine, host/solo-owned, nothing on the wire). Layer: core engine
// combat rules, no capability (every world's elites need them; a kind opts in through its own data, `MobKind.poiseMax`,
// `charge`, `guard`, and a kind with none behaves as it always did).
//
// A high-tier foe must not be chipped down by something that cannot hurt it: spamming spells while backing away, or
// juggling it with every swing. Four rules, all tuned per kind in the content:
//  - Poise: a budget of blows it shrugs off. Light blows (sword, arrow) cost 1, spells 2; only when it runs out does a hit
//    stagger it (then it stands up with poise full again). Left alone for a while it mends. While it winds up or lunges a
//    poised foe cannot be interrupted at all (hyper-armor).
//  - Level gap: against a hero 3 or more levels under it, a foe is stunned for far less, hits harder and takes
//    flat armor off every blow, so underlevelled chipping stops working and a mistake in reach hurts.
//  - Guard: a shielded foe turns frontal arrows and spells aside while its shield is up; flank it, hit it in melee,
//    or break its poise.
//  - Charge: a gap-closer for the foe that is kited (see `Mob.ts`); its defaults and the check on it are here.

import {
  mobLevel,
  type MobCharge,
  type MobGuard,
  type MobHeal,
  type MobKind,
  type MobSpread,
  type MobSprint,
} from './combat';

// --- Poise ---

/** What a blow costs a foe's poise: a sword swing or an arrow, and a spell. */
export const POISE_LIGHT = 1;
export const POISE_HEAVY = 2;
/** Seconds without being hit after which poise is whole again (a kind may say its own). */
export const POISE_REGEN = 2;
/** The longest a kind's poise budget may be (the content check holds it to this). */
export const POISE_CAP = 12;

/** A foe's poise: `take` a blow, `tick` time on, and it says when the blow broke it. A max of 0 is "no poise": every blow breaks it. */
export class Poise {
  current: number;
  /** Seconds since it was last hit. */
  quiet = 0;

  constructor(
    readonly max: number,
    readonly regen: number = POISE_REGEN,
  ) {
    this.current = max;
  }

  /** Whether the foe has any poise to lose (a plain foe staggers on every blow, as it always did). */
  get armed(): boolean {
    return this.max > 0;
  }

  /** Take a blow of `amount`: true when it leaves the foe broken (always, for a foe with no poise). */
  take(amount: number): boolean {
    this.quiet = 0;
    if (!this.armed) return true;
    this.current = Math.max(0, this.current - amount);
    return this.current <= 0;
  }

  /** Let `dt` seconds pass: poise mends once the foe has gone `regen` seconds unhurt. */
  tick(dt: number) {
    if (!this.armed || this.current >= this.max) return;
    this.quiet += dt;
    if (this.quiet > this.regen) this.restore();
  }

  restore() {
    this.current = this.max;
    this.quiet = 0;
  }
}

/** What a blow tells the foe it hits (`Mob.hit`): its poise cost, and the share of its usual stun it lands for (`stunFactor`). */
export interface Blow {
  poise?: number;
  stun?: number;
}

/** The poise cost of a blow: a spell is heavy, a swing or an arrow light. */
export const poiseCost = (spell: boolean): number => (spell ? POISE_HEAVY : POISE_LIGHT);

// --- Level gap ---

/** A foe this many levels over the hero starts to punish (and shrug off) them. */
export const GAP_START = 3;

/**
 * How many levels a foe stands over `heroLevel` (negative when the hero is the higher). A boss or a named foe is made for
 * the party, not read from its body (its numbers are not a level), so it has no gap.
 */
export function levelGap(kind: MobKind, heroLevel: number): number {
  if (kind.boss || kind.named) return 0;
  return mobLevel(kind) - heroLevel;
}

/** Steps past the start of the gap (0 while the foe is within reach of the hero's level). */
const over = (gap: number): number => (gap >= GAP_START ? gap - GAP_START + 1 : 0);

/** The share of its usual stun a hit lands for: whole inside the gap's start, then halved for every level past it (never below a tenth). */
export const stunFactor = (gap: number): number => (gap >= GAP_START ? Math.max(0.1, 0.5 ** over(gap)) : 1);

/** What its blows are multiplied by: 1.15 at the start of the gap, 15% more for each level past it, at most double. */
export const furyFactor = (gap: number): number => (gap >= GAP_START ? Math.min(2, 1 + 0.15 * over(gap)) : 1);

/** Extra flat armor against a hero this far under it: 1 at the start of the gap, one more for every level past it. */
export const gapArmor = (gap: number): number => over(gap);

/** A blow's damage after more flat armor on top of what `rollDamage` took off: never below 1. */
export const afterArmor = (damage: number, armor: number): number => Math.max(1, damage - armor);

// --- Guard ---

export const GUARD_DEFAULTS: MobGuard = {
  arc: 120, // degrees of its front the shield covers
  chip: 0, // share of a blocked blow that still gets through
};

export const resolveGuard = (g: Partial<MobGuard> = {}): MobGuard => ({ ...GUARD_DEFAULTS, ...g });

/**
 * Whether a blow travelling along (vx, vy) strikes a foe facing (fx, fy) on the shielded side: its travel runs against
 * where the foe looks, within half the arc. A blow with no direction is not frontal.
 */
export function frontal(fx: number, fy: number, vx: number, vy: number, arc: number): boolean {
  const len = Math.hypot(vx, vy);
  const face = Math.hypot(fx, fy);
  if (!len || !face) return false;
  const cos = -(fx * vx + fy * vy) / (len * face);
  return cos >= Math.cos((arc / 2) * (Math.PI / 180));
}

/** What a blocked blow still does: the kind's `chip` share of it (0 lets nothing through). */
export const blockedDamage = (damage: number, guard: MobGuard): number => Math.floor(damage * guard.chip);

// --- Charge (a gap-closer) ---

export const CHARGE_DEFAULTS: MobCharge = {
  range: 96, // px (3 cells): further than this from the hero starts the count
  after: 1.5, // seconds the hero must stay out of range, in the fight, before it charges
  windup: 0.65, // the telegraph (longer than a plain blow's: it is a bigger move)
  speed: 300, // px/s of the dash (the hero walks at 120)
  duration: 0.3, // seconds the dash lasts at most (about 90 px)
  cooldown: 4, // seconds before it may charge again
  power: 1.25, // its blow is this much heavier than a plain one
};

export const resolveCharge = (c: Partial<MobCharge> = {}): MobCharge => ({ ...CHARGE_DEFAULTS, ...c });

// --- Farming (a spot cannot be ground for XP and gold) ---

/** Seconds a foe stays down the first time it falls. */
export const RESPAWN_BASE = 60;
/** Each fall of the same foe keeps it down this much longer than the last, up to `RESPAWN_CAP`. */
export const RESPAWN_GROWTH = 1.5;
export const RESPAWN_CAP = 300;

/** How long a foe stays down after its `falls`-th fall (0 for the first): a minute, then 90 s, 135 s... at most five minutes. */
export const respawnWait = (falls: number): number => Math.min(RESPAWN_CAP, RESPAWN_BASE * RESPAWN_GROWTH ** falls);

// --- Sprint (a burst of speed) ---

export const SPRINT_DEFAULTS: MobSprint = {
  speed: 168, // px/s: well over the hero's 120, so running does not shake it off for the length of a burst
  duration: 1.1, // seconds: a medium burst, about 185 px, then it is back to its walk
  cooldown: 4, // seconds before it may burst again
  range: 90, // px: a hero closer than this is already in its reach
};

/** The longest a burst may last: past this a hero cannot outwalk it to a wall or a door. */
export const SPRINT_MAX_DURATION = 1.6;

export const resolveSprint = (s: Partial<MobSprint> = {}): MobSprint => ({ ...SPRINT_DEFAULTS, ...s });

// --- Quick (a snap attacker) ---

/** The shortest windup a quick kind has once the melee pace is applied (`mobTimings`; its spread may take 20% off): a test of reflexes, not a trap. */
export const QUICK_WINDUP = 0.2;
/** A quick kind's blow is this share of a plain one, and it must rest at least `QUICK_RECOVER` after it. */
export const QUICK_POWER = 0.75;
export const QUICK_RECOVER = 1;

// --- Spread (a fan of bolts) ---

export const SPREAD_MAX_COUNT = 7;
export const SPREAD_MAX_ARC = 120;

/** The bolt angles of a fan around `aim` (radians): `count` of them, `arc` degrees from first to last; one bolt flies straight. */
export function spreadAngles(aim: number, spread: Pick<MobSpread, 'count' | 'arc'>): number[] {
  const { count, arc } = spread;
  if (count <= 1) return [aim];
  const step = (arc * (Math.PI / 180)) / (count - 1);
  return Array.from({ length: count }, (_, i) => aim + (i - (count - 1) / 2) * step);
}

/** How fast a shot may fly: fair at a plain windup up to 1.6x the hero's walk, faster only with a longer telegraph. */
export const FAST_SHOT_WINDUP = 0.75;

// --- Heal (a support foe mends its allies) ---

export const HEAL_DEFAULTS: MobHeal = {
  range: 160, // px
  amount: 0.25, // a quarter of the ally's health
  cooldown: 6, // seconds between mends: a healer slows a fight, it cannot make a foe immortal
  below: 0.6, // only an ally under this share of its health is mended
  rest: 0.9, // seconds busy casting: the healer is open to a blow while it does
};

export const resolveHeal = (h: Partial<MobHeal> = {}): MobHeal => ({ ...HEAL_DEFAULTS, ...h });

/** A foe a healer may mend: alive, not itself, not a boss, and hurt (under `below` of its health). */
export interface Patient {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mendable: boolean;
}

/** The index of the most wounded patient within range of (x, y), or -1: the healer goes for whoever is worst off. */
export function pickPatient(x: number, y: number, patients: readonly Patient[], heal: MobHeal): number {
  let best = -1;
  let worst = heal.below;
  patients.forEach((p, i) => {
    const share = p.hp / p.maxHp;
    if (!p.mendable || share >= worst || Math.hypot(p.x - x, p.y - y) > heal.range) return;
    worst = share;
    best = i;
  });
  return best;
}

/** What a mend gives back: `amount` of the patient's max HP, never past full. */
export const mendAmount = (hp: number, maxHp: number, heal: MobHeal): number =>
  Math.max(0, Math.min(maxHp - hp, Math.round(maxHp * heal.amount)));
