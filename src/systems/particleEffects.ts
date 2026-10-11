import type { EffectDef } from './particles';

/**
 * Every particle effect in the game, by name. This is pure data: add an entry here (see the
 * `add-particle-effect` skill for the field guide) and spawn it with `particleEffect('name', x, y)`.
 * `particleEffects.test.ts` checks every entry for sane values and that it finishes.
 *
 * Palette: cyan magic 0x4de3ff, gold 0xffb13f, hurt red 0xff5a5a, shade purple 0x6a4c93.
 */
export const PARTICLE_EFFECTS = {
  /** Sparks flung out of a struck mob. Spawn with `dir` = the direction of the blow. */
  hitSpark: {
    emitters: [
      {
        shape: 'streak',
        burst: [5, 7],
        life: [0.18, 0.32],
        speed: [90, 200],
        angle: [-0.9, 0.9],
        size: [10, 16],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xffd34a, 0xe7682f],
        drag: 4,
        align: true,
      },
      {
        shape: 'glow',
        burst: 1,
        life: 0.12,
        size: 22,
        sizeOverLife: [0.6, 1.2],
        alphaOverLife: [0.9, 0],
        colorOverLife: 0xffd98a,
      },
    ],
  },

  /** The tail behind the Time Bolt. Move the emitter with it, `stop()` when the bolt ends. */
  boltTrail: {
    emitters: [
      {
        shape: 'dot',
        rate: 70,
        life: [0.18, 0.35],
        speed: [0, 14],
        radius: [0, 2],
        size: [4, 6],
        sizeOverLife: [1, 0.2],
        alphaOverLife: [0.9, 0],
        colorOverLife: [0xe8fdff, 0x4de3ff, 0x406181],
      },
    ],
  },

  /** The bolt bursting on a mob or wall. */
  boltImpact: {
    emitters: [
      {
        shape: 'dot',
        burst: [9, 12],
        life: [0.2, 0.4],
        speed: [40, 110],
        size: [3, 5],
        sizeOverLife: [1, 0.2],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xe8fdff, 0x4de3ff, 0x406181],
        drag: 5,
      },
      {
        shape: 'glow',
        burst: 1,
        life: 0.18,
        size: 26,
        sizeOverLife: [0.5, 1.3],
        alphaOverLife: [0.8, 0],
        colorOverLife: 0x4de3ff,
      },
    ],
  },

  /** A mob dissolving: a puff of dark motes that drift up. */
  mobPoof: {
    emitters: [
      {
        shape: 'dot',
        burst: [12, 16],
        life: [0.5, 0.9],
        speed: [10, 45],
        radius: [0, 6],
        size: [4, 8],
        sizeOverLife: [0.8, 1.6],
        alphaOverLife: [0.85, 0.5, 0],
        colorOverLife: [0x8a6fb5, 0x6a4c93, 0x263a4d],
        gravity: -30,
        drag: 2,
      },
    ],
  },

  /** Gold sparkles rising around the hero on a level-up. */
  levelUp: {
    emitters: [
      {
        shape: 'dot',
        burst: 14,
        life: [0.5, 0.8],
        speed: [30, 80],
        size: [5, 8],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xffd34a, 0xe7682f],
        drag: 3,
        gravity: -40,
      },
      {
        shape: 'dot',
        rate: 40,
        duration: 0.7,
        life: [0.4, 0.7],
        speed: [10, 30],
        angle: [-Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4],
        radius: [6, 14],
        size: [4, 6],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [0, 1, 0],
        colorOverLife: [0xffffff, 0xffd34a, 0xe7682f],
      },
      {
        shape: 'glow',
        burst: 1,
        life: 0.3,
        size: 40,
        sizeOverLife: [0.5, 1.4],
        alphaOverLife: [0.7, 0],
        colorOverLife: 0xffe9a8,
      },
    ],
  },

  /** Red flecks when the hero is struck. */
  heroHurt: {
    emitters: [
      {
        shape: 'dot',
        burst: [7, 9],
        life: [0.2, 0.4],
        speed: [50, 120],
        size: [2, 4],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xff5a5a, 0xb82024],
        drag: 4,
        gravity: 80,
      },
    ],
  },
} as const satisfies Record<string, EffectDef>;

export type ParticleEffectName = keyof typeof PARTICLE_EFFECTS;
