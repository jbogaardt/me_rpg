import type { ParticleEffectName } from './particleEffects';

/**
 * Game feel: what the screen does when something big happens (Pixi-free; `Visuals.particles` applies it). Core engine,
 * visual only. A shake is `core/camera.ts`'s (strength 0 to 1, seconds); every page plays the same effect event, so a
 * co-op guest's screen shakes with the host's without a message of its own.
 */
export interface Shake {
  strength: number;
  seconds: number;
  /** Only the player it happened to feels it (a hit on someone else is not a hit on you). */
  own?: boolean;
}

/**
 * A directional kick (`Camera.kick`): the view jumps `px` screen px along the blow and settles in `seconds`. `Visuals`
 * plays it from the effect events that already go to every page (the hit's spark carries the blow's angle and the striker
 * as `p`; a foe's death takes the angle of the blow before it; a hero's hurt carries the angle away from the attacker), so
 * no message of its own: a guest feels it on its own screen, and only the player it happened to feels it.
 */
export interface Kick {
  px: number;
  seconds: number;
  own?: boolean;
}

export const KICK_HIT: Kick = { px: 2, seconds: 0.09, own: true };
export const KICK_KILL: Kick = { px: 3.5, seconds: 0.12, own: true };

export const FX_KICK: Partial<Record<ParticleEffectName, Kick>> = {
  hitSpark: KICK_HIT,
  hitGraze: { px: 1, seconds: 0.07, own: true },
  hitHeavy: { px: 3.5, seconds: 0.12, own: true },
  heroHurt: { px: 4, seconds: 0.14, own: true },
  heroHurtHeavy: { px: 6, seconds: 0.18, own: true },
  mobPoof: KICK_KILL,
  mobDust: KICK_KILL,
  mobSplat: KICK_KILL,
  mobWisp: KICK_KILL,
};

/** The effects that are a foe going (they have no angle of their own: the last blow's is used). */
export const DEATH_FX: readonly ParticleEffectName[] = ['mobPoof', 'mobDust', 'mobSplat', 'mobWisp'];

/** The effects that are a blow landing on a foe (the angle of the last one is what a death's kick follows). */
export const HIT_FX_NAMES: readonly ParticleEffectName[] = ['hitSpark', 'hitGraze', 'hitHeavy'];

export const FX_SHAKE: Partial<Record<ParticleEffectName, Shake>> = {
  heroHurt: { strength: 0.16, seconds: 0.14, own: true },
  heroHurtHeavy: { strength: 0.3, seconds: 0.2, own: true },
  hitHeavy: { strength: 0.06, seconds: 0.08, own: true },
  blast: { strength: 0.3, seconds: 0.28 },
  nova: { strength: 0.18, seconds: 0.2 },
  bossFinale: { strength: 0.8, seconds: 0.7 },
};
