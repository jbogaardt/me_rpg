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

export const FX_SHAKE: Partial<Record<ParticleEffectName, Shake>> = {
  heroHurt: { strength: 0.16, seconds: 0.14, own: true },
  blast: { strength: 0.3, seconds: 0.28 },
  nova: { strength: 0.18, seconds: 0.2 },
  bossFinale: { strength: 0.8, seconds: 0.7 },
};
