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
        burst: [7, 9],
        life: [0.15, 0.25],
        speed: [130, 260],
        angle: [-0.65, 0.65], // a cone along the blow (`dir`), away from the hit
        size: [10, 18],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xffd34a, 0xe7682f],
        drag: 4,
        align: true,
      },
      {
        shape: 'glow',
        burst: 1,
        life: 0.1,
        size: 26,
        sizeOverLife: [0.6, 1.2],
        alphaOverLife: [1, 0],
        colorOverLife: [0xffffff, 0xffe9b0], // the impact flash: white first
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

  // --- Places: continuous effects a map object or a patch of ground gives off (entities/Hearth.ts) ---

  /** The grey smoke of a campfire or torch, curling up, drifting and widening as it thins. Runs until stopped. */
  smoke: {
    emitters: [
      {
        shape: 'glow',
        rate: 7,
        life: [1.4, 2.2],
        speed: [8, 18],
        angle: [-Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35],
        radius: [0, 3],
        size: [8, 12],
        sizeOverLife: [0.6, 1.4, 2.4],
        alphaOverLife: [0, 0.38, 0.22, 0],
        colorOverLife: [0x6e6874, 0x8a8890, 0xb4b2b8],
        gravity: -14,
        drag: 0.8,
        spin: [-0.6, 0.6],
      },
    ],
  },

  /** Flame-lit sparks that float up from a fire and go out. Runs until stopped. */
  embers: {
    emitters: [
      {
        shape: 'dot',
        blend: 'add',
        rate: 5,
        life: [0.7, 1.4],
        speed: [10, 34],
        angle: [-Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7],
        radius: [0, 5],
        size: [2, 4],
        sizeOverLife: [1, 0.4],
        alphaOverLife: [0, 1, 0.8, 0],
        colorOverLife: [0xffe08a, 0xffb13f, 0xe7682f, 0x963a11],
        gravity: -26,
        drag: 0.6,
      },
    ],
  },

  /** A lick of flame for a torch or brazier: the warm flicker, a small glow, a few sparks. Runs until stopped. */
  flame: {
    emitters: [
      {
        // The tongue itself, plain alpha so it reads on bright ground too (the additive glow only shows on dark).
        shape: 'dot',
        rate: 16,
        life: [0.2, 0.4],
        speed: [8, 20],
        angle: [-Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35],
        radius: [0, 3],
        size: [4, 7],
        sizeOverLife: [1, 0.4],
        alphaOverLife: [1, 0.9, 0],
        colorOverLife: [0xfff0b0, 0xffb13f, 0xe7682f, 0xb82024],
        gravity: -36,
      },
      {
        shape: 'glow',
        blend: 'add',
        rate: 14,
        life: [0.25, 0.45],
        speed: [6, 16],
        angle: [-Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3],
        radius: [0, 2],
        size: [8, 12],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [0.7, 0.4, 0],
        colorOverLife: [0xfff0b0, 0xffb13f, 0xe7682f],
        gravity: -30,
      },
    ],
  },

  /** Lava coming to the boil: slow orange bubbles that swell and pop in a little spit of sparks. Runs until stopped. */
  lavaBubble: {
    emitters: [
      {
        shape: 'glow',
        rate: 3,
        life: [0.6, 1],
        speed: [0, 6],
        radius: [0, 10],
        size: [6, 10],
        sizeOverLife: [0.3, 1, 1.3],
        alphaOverLife: [0, 0.8, 0],
        colorOverLife: [0xffd34a, 0xe7682f, 0xb82024],
      },
      {
        shape: 'dot',
        rate: 2,
        life: [0.4, 0.8],
        speed: [20, 50],
        angle: [-Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9],
        radius: [0, 8],
        size: [2, 3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffe08a, 0xe7682f],
        gravity: 140,
      },
    ],
  },

  /** Fireflies drifting about a dark meadow: soft green-gold dots that fade in and out. Runs until stopped. */
  fireflies: {
    emitters: [
      {
        shape: 'glow',
        blend: 'add',
        rate: 3,
        life: [2, 3.5],
        speed: [4, 14],
        radius: [0, 60],
        size: [5, 7],
        alphaOverLife: [0, 0.9, 0.3, 0.9, 0],
        colorOverLife: [0xd6ff7a, 0xffe66a],
        drag: 0.3,
        spin: [-1, 1],
      },
    ],
  },

  /** Drips from a cave roof: a bead falls, and a few droplets spring up where it lands. Runs until stopped. */
  drip: {
    emitters: [
      {
        shape: 'dot',
        rate: 0.7,
        life: [0.45, 0.6],
        speed: 0,
        radius: [0, 3],
        size: [2, 3],
        alphaOverLife: [0.9, 0.9, 0],
        colorOverLife: [0xb8d8ee, 0x6fa8cc],
        gravity: 260,
      },
    ],
  },

  // --- The hero's feet and what the hero touches ---

  /** A little puff of ground kicked up by a step or a landing (dust on dry ground). */
  dust: {
    emitters: [
      {
        shape: 'glow',
        burst: [2, 3],
        life: [0.3, 0.5],
        speed: [8, 22],
        angle: [-Math.PI * 0.85, -Math.PI * 0.15],
        radius: [0, 3],
        size: [6, 9],
        sizeOverLife: [0.6, 1.6],
        alphaOverLife: [0.4, 0],
        colorOverLife: [0xcdb98a, 0xa89a78],
        drag: 4,
      },
    ],
  },

  /** Water thrown up round a wader's feet. */
  splash: {
    emitters: [
      {
        shape: 'dot',
        burst: [6, 9],
        life: [0.3, 0.5],
        speed: [30, 70],
        angle: [-Math.PI / 2 - 0.8, -Math.PI / 2 + 0.8],
        size: [2, 4],
        sizeOverLife: [1, 0.5],
        alphaOverLife: [1, 0.9, 0],
        colorOverLife: [0xe8f6ff, 0x8fcbea, 0x4e8fc0],
        gravity: 220,
      },
    ],
  },

  /** A burst of white-gold stars for something rare: a loot drop, a chest thrown open, a spell learned. */
  sparkle: {
    emitters: [
      {
        shape: 'dot',
        burst: [10, 14],
        life: [0.5, 0.9],
        speed: [30, 90],
        angle: [-Math.PI * 0.95, -Math.PI * 0.05],
        size: [3, 6],
        sizeOverLife: [1, 0.2],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xfff3c0, 0xffd34a, 0xe7a31f],
        gravity: 120,
        drag: 2,
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.4,
        size: 40,
        sizeOverLife: [0.4, 1.2],
        alphaOverLife: [0.8, 0],
        colorOverLife: 0xfff3c0,
      },
    ],
  },

  /** A column of light over a rare drop, rising for a moment. Colour it by playing it at a drop. */
  lootBeam: {
    emitters: [
      {
        shape: 'streak',
        blend: 'add',
        rate: 30,
        duration: 1.2,
        life: [0.5, 0.8],
        speed: [80, 140],
        angle: -Math.PI / 2,
        radius: [0, 4],
        size: [10, 16],
        alphaOverLife: [0, 0.9, 0],
        colorOverLife: [0xfff3c0, 0xffd34a],
        align: true,
      },
    ],
  },

  /** A few coins that spring out of a purse or a corpse. */
  coinPop: {
    emitters: [
      {
        shape: 'dot',
        burst: [4, 6],
        life: [0.5, 0.7],
        speed: [40, 80],
        angle: [-Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6],
        size: [3, 4],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffe9a8, 0xffd34a, 0xe7a31f],
        gravity: 320,
      },
    ],
  },

  // --- How a foe goes (an enemy's `death` in entities.json; the plain one is `mobPoof`) ---

  /** Bones and old stone crumbling to dust: grey flecks fall and a pale cloud settles. */
  mobDust: {
    emitters: [
      {
        shape: 'dot',
        burst: [12, 16],
        life: [0.5, 0.9],
        speed: [10, 50],
        angle: [-Math.PI * 0.9, -Math.PI * 0.1],
        radius: [0, 6],
        size: [3, 6],
        sizeOverLife: [1, 0.7],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xe6e0d0, 0xb8b09c, 0x7a7466],
        gravity: 260,
        drag: 1.5,
      },
      {
        shape: 'glow',
        burst: [3, 4],
        life: [0.6, 0.9],
        speed: [4, 14],
        radius: [0, 8],
        size: [14, 20],
        sizeOverLife: [0.6, 1.6],
        alphaOverLife: [0.35, 0],
        colorOverLife: [0xcfc8b4, 0x9a9484],
      },
    ],
  },

  /** A slime or ooze bursting: wet blobs flung out that fall back. */
  mobSplat: {
    emitters: [
      {
        shape: 'glow',
        burst: [10, 14],
        life: [0.4, 0.7],
        speed: [40, 100],
        angle: [-Math.PI * 0.95, -Math.PI * 0.05],
        radius: [0, 4],
        size: [5, 9],
        sizeOverLife: [1, 0.6],
        alphaOverLife: [0.9, 0.9, 0],
        colorOverLife: [0xbff58a, 0x6fbf3c, 0x3a7a24],
        gravity: 340,
        drag: 1,
      },
    ],
  },

  /** A spirit unravelling: a few slow wisps rise and fade, and a cold glow goes out. */
  mobWisp: {
    emitters: [
      {
        shape: 'glow',
        blend: 'add',
        burst: [7, 9],
        life: [0.8, 1.3],
        speed: [8, 26],
        angle: [-Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9],
        radius: [0, 8],
        size: [8, 14],
        sizeOverLife: [1, 0.4],
        alphaOverLife: [0, 0.8, 0],
        colorOverLife: [0xd9a8ff, 0x8a6fb5, 0x4de3ff],
        gravity: -34,
        drag: 1.2,
        spin: [-1, 1],
      },
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.5,
        size: 44,
        sizeOverLife: [1, 0.2],
        alphaOverLife: [0.6, 0],
        colorOverLife: 0xb08aff,
      },
    ],
  },

  /** A big foe going down: a shower of dust and sparks and a flash. Played with a camera shake for bosses. */
  bossFinale: {
    emitters: [
      {
        shape: 'glow',
        blend: 'add',
        burst: 1,
        life: 0.5,
        size: 90,
        sizeOverLife: [0.3, 1.6],
        alphaOverLife: [0.9, 0],
        colorOverLife: [0xffffff, 0xffd34a],
      },
      {
        shape: 'dot',
        blend: 'add',
        burst: [28, 36],
        life: [0.6, 1.2],
        speed: [60, 190],
        radius: [0, 10],
        size: [3, 7],
        sizeOverLife: [1, 0.3],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffffff, 0xffd34a, 0xe7682f],
        gravity: 140,
        drag: 2,
      },
      {
        shape: 'glow',
        burst: [8, 10],
        life: [0.8, 1.3],
        speed: [10, 40],
        radius: [0, 18],
        size: [18, 28],
        sizeOverLife: [0.6, 1.8],
        alphaOverLife: [0.4, 0],
        colorOverLife: [0x9a9484, 0x6e6874],
        gravity: -20,
        drag: 1.5,
      },
    ],
  },

  // --- Moments ---

  /** The cheer after a win: a ring of gold confetti thrown up and falling round the hero. */
  cheer: {
    emitters: [
      {
        shape: 'dot',
        burst: [22, 28],
        life: [0.9, 1.4],
        speed: [60, 150],
        angle: [-Math.PI * 0.95, -Math.PI * 0.05],
        radius: [0, 6],
        size: [3, 5],
        alphaOverLife: [1, 1, 0],
        colorOverLife: [0xffd34a, 0xe7682f, 0xb82024, 0x406181, 0xffd34a],
        gravity: 260,
        drag: 1.4,
        spin: [-6, 6],
      },
    ],
  },

  /** A hero falling: the light goes out of them in a slow grey-blue breath that drifts up. */
  fall: {
    emitters: [
      {
        shape: 'glow',
        burst: [8, 10],
        life: [1, 1.6],
        speed: [6, 22],
        angle: [-Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9],
        radius: [0, 10],
        size: [10, 16],
        sizeOverLife: [0.8, 1.6],
        alphaOverLife: [0, 0.5, 0],
        colorOverLife: [0xb8c4d8, 0x7c8aa0, 0x4a5468],
        gravity: -22,
        drag: 1,
      },
    ],
  },
} as const satisfies Record<string, EffectDef>;

export type ParticleEffectName = keyof typeof PARTICLE_EFFECTS;

/** How a foe may go (an enemy's `death` in entities.json); the effect of the same name plays where it fell. */
export const MOB_DEATHS = [
  'mobPoof',
  'mobDust',
  'mobSplat',
  'mobWisp',
] as const satisfies readonly ParticleEffectName[];
export type MobDeath = (typeof MOB_DEATHS)[number];
