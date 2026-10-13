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

  /** The tail behind a wand's bolt. Move the emitter with it, `stop()` when the bolt ends. */
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
  // --- Wand and tome spells (see systems/spells.ts and scenes/overworld/Casting.ts) ---

  /** A flash at the caster's hands as a combo goes off (also what tells a friend's screen to play the cast pose). */
  castGlow: {
    emitters: [
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.25,
        size: 34,
        sizeOverLife: [0.4, 1.3],
        alphaOverLife: [0.9, 0],
        colorOverLife: [0xe8fdff, 0x4de3ff],
      },
      {
        shape: 'dot',
        blend: 'add',
        burst: [6, 8],
        life: [0.2, 0.4],
        speed: [30, 80],
        size: [3, 5],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 0],
        colorOverLife: [0xffffff, 0x4de3ff],
        drag: 4,
      },
    ],
  },

  /** A ring of force flung out of the caster (the Nova: it reaches about 3 cells). */
  nova: {
    emitters: [
      {
        shape: 'dot',
        blend: 'add',
        burst: [34, 40],
        life: [0.35, 0.5],
        speed: [250, 310],
        size: [5, 8],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0x9be8ff, 0x4d7bff],
        drag: 3.2,
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.3,
        size: 64,
        sizeOverLife: [0.5, 2.6],
        alphaOverLife: [0.7, 0],
        colorOverLife: 0x9be8ff,
      },
    ],
  },

  /** The Meteor landing: fire thrown out of the crater, smoke rising behind it. */
  blast: {
    emitters: [
      {
        shape: 'dot',
        blend: 'add',
        burst: [28, 34],
        life: [0.3, 0.6],
        speed: [120, 230],
        size: [5, 9],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xffd34a, 0xe7682f, 0x7a2a1a],
        drag: 3,
      },
      {
        shape: 'dot',
        burst: [8, 10],
        life: [0.6, 1],
        speed: [10, 50],
        radius: [0, 14],
        size: [8, 14],
        sizeOverLife: [0.8, 1.8],
        alphaOverLife: [0.6, 0.4, 0],
        colorOverLife: [0x8a6a5a, 0x3b3030],
        gravity: -26,
        drag: 2,
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.25,
        size: 90,
        sizeOverLife: [0.4, 1.4],
        alphaOverLife: [0.8, 0],
        colorOverLife: 0xffc16a,
      },
    ],
  },

  /** Lightning striking a foe: jagged white-blue streaks and a flash. */
  zap: {
    emitters: [
      {
        shape: 'streak',
        blend: 'add',
        burst: [7, 9],
        life: [0.12, 0.26],
        speed: [120, 260],
        size: [12, 20],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xbfe0ff, 0x5a8cff],
        drag: 4,
        align: true,
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.16,
        size: 40,
        sizeOverLife: [0.6, 1.2],
        alphaOverLife: [0.9, 0],
        colorOverLife: 0xd8ecff,
      },
    ],
  },

  /** Green motes rising round someone being healed. */
  heal: {
    emitters: [
      {
        shape: 'dot',
        blend: 'add',
        rate: 36,
        duration: 0.6,
        life: [0.5, 0.8],
        speed: [12, 34],
        angle: [-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5],
        radius: [6, 16],
        size: [4, 7],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [0, 1, 0],
        colorOverLife: [0xffffff, 0x8dff9f, 0x2fbf5a],
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.4,
        size: 48,
        sizeOverLife: [0.6, 1.2],
        alphaOverLife: [0.6, 0],
        colorOverLife: 0x8dff9f,
      },
    ],
  },

  /** A shell of pale blue light closing round someone who is warded. */
  ward: {
    emitters: [
      {
        shape: 'dot',
        blend: 'add',
        burst: [22, 26],
        life: [0.5, 0.7],
        speed: [40, 70],
        radius: [18, 22],
        size: [4, 6],
        sizeOverLife: [1, 0.4],
        alphaOverLife: [0, 1, 0],
        colorOverLife: [0xffffff, 0xbfe6ff, 0x6aa8ff],
        drag: 2,
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.5,
        size: 70,
        sizeOverLife: [1.2, 0.6],
        alphaOverLife: [0, 0.6, 0],
        colorOverLife: 0xbfe6ff,
      },
    ],
  },

  /** Ice shards bursting round a frozen foe, and a pale ring where Stasis is cast. */
  frost: {
    emitters: [
      {
        shape: 'streak',
        blend: 'add',
        burst: [9, 11],
        life: [0.25, 0.5],
        speed: [60, 150],
        size: [9, 15],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xcfeeff, 0x7ac8ff],
        drag: 3,
        align: true,
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.35,
        size: 52,
        sizeOverLife: [0.5, 1.4],
        alphaOverLife: [0.7, 0],
        colorOverLife: 0xbfe8ff,
      },
    ],
  },

  /** The puff where a Blink starts or ends. */
  blink: {
    emitters: [
      {
        shape: 'dot',
        blend: 'add',
        burst: [14, 18],
        life: [0.25, 0.45],
        speed: [40, 120],
        radius: [0, 6],
        size: [4, 7],
        sizeOverLife: [1, 0.2],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xd9a8ff, 0x7a4cff],
        drag: 4,
      },
    ],
  },
} as const satisfies Record<string, EffectDef>;

export type ParticleEffectName = keyof typeof PARTICLE_EFFECTS;
