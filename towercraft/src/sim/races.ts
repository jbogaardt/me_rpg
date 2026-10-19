// The three races, as data (Pixi-free). Each has a castle that can be upgraded twice, two tiers of units trained there and
// two tiers of towers built within the castle's reach. What makes a race is how its numbers trade off, and a few traits (see
// CLAUDE.md for the plan to grow them, StarCraft-style); the ids name the role, the display names the Wyrmsun faction:
//   swarm  (Goblins) fast, weak, many: cheap units trained in pairs, cheap towers, cheap upgrades; dies to splash.
//   titan  (Dwarves) slow, strong, expensive: few big units, long-range towers, costly upgrades, a tough castle.
//   legion (Germanic) the middle road on every axis, and the yardstick the other two are tuned against.
// `art` names a picture in towercraft/public/art (CREDITS.md there); a unit's `sheet` is its animated sheet in art/units.
// Distances are cells, times seconds, costs gold. A unit's `range` is how far its attack reaches (about 1 = melee).

export type RaceId = 'swarm' | 'titan' | 'legion';

export interface UnitDef {
  id: string;
  name: string;
  art: string;
  sheet: string;
  /** Castle level needed to train it. */
  tier: number;
  cost: number;
  /** Seconds the castle spends training one purchase. */
  train: number;
  /** How many walk out for one purchase. */
  count: number;
  hp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
}

export interface TowerDef {
  id: string;
  name: string;
  art: string;
  /** Castle level needed to build it. */
  tier: number;
  cost: number;
  hp: number;
  range: number;
  damage: number;
  cooldown: number;
  /** Cells round the target that also take the damage (0 = just the target). */
  splash: number;
  /** Cells round this tower where more may be built (0 = it extends nothing): how a front line is pushed forward. */
  reach: number;
}

export interface CastleDef {
  art: string;
  hp: number;
  /** Cells round the castle where towers may be built, by castle level (1, 2, 3). */
  reach: number[];
  /** Gold to go up from level 1 to 2, and 2 to 3. */
  upgrades: number[];
  /** Pay (gold per pay day) added at each level, on top of the base pay. */
  pay: number[];
  /** Extra castle hit points gained with each upgrade. */
  hpPerLevel: number;
  /** The castle shoots the nearest enemy unit in range. */
  range: number;
  damage: number;
  cooldown: number;
}

export interface Race {
  id: RaceId;
  name: string;
  blurb: string;
  color: number;
  castle: CastleDef;
  units: UnitDef[];
  towers: TowerDef[];
}

export const MAX_LEVEL = 3;

export const RACES: Record<RaceId, Race> = {
  swarm: {
    id: 'swarm',
    name: 'Goblins',
    blurb: 'Fast, weak and many. Floods the road in pairs; cheap towers and cheap upgrades.',
    color: 0xe7682f,
    castle: {
      art: 'goblin_castle',
      hp: 1200,
      reach: [6, 9, 13],
      upgrades: [90, 190],
      pay: [0, 3, 6],
      hpPerLevel: 300,
      range: 3,
      damage: 5,
      cooldown: 0.8,
    },
    units: [
      {
        id: 'spearman',
        name: 'Goblin Spearmen',
        art: 'goblin_spearman',
        sheet: 'goblin_spearman',
        tier: 1,
        cost: 16,
        train: 1.5,
        count: 2,
        hp: 28,
        speed: 2.2,
        damage: 5,
        range: 1,
        cooldown: 0.9,
      },
      {
        id: 'thief',
        name: 'Goblin Thieves',
        art: 'goblin_thief',
        sheet: 'goblin_thief',
        tier: 2,
        cost: 34,
        train: 2,
        count: 2,
        hp: 42,
        speed: 3,
        damage: 8,
        range: 1,
        cooldown: 0.6,
      },
    ],
    towers: [
      {
        id: 'nest',
        name: 'Watch Nest',
        art: 'goblin_watch_tower',
        tier: 1,
        cost: 30,
        hp: 120,
        range: 3,
        damage: 4,
        cooldown: 0.45,
        splash: 0,
        reach: 3,
      },
      {
        id: 'guard',
        name: 'Guard Tower',
        art: 'goblin_guard_tower',
        tier: 2,
        cost: 70,
        hp: 260,
        range: 3.5,
        damage: 6,
        cooldown: 0.4,
        splash: 0,
        reach: 2,
      },
    ],
  },
  titan: {
    id: 'titan',
    name: 'Dwarves',
    blurb: 'Slow, strong and costly. A few armoured giants, long-range towers, a tough castle.',
    color: 0x406181,
    castle: {
      art: 'dwarf_castle',
      hp: 2000,
      reach: [6, 9, 13],
      upgrades: [160, 360],
      pay: [0, 4, 9],
      hpPerLevel: 500,
      range: 4,
      damage: 14,
      cooldown: 1.4,
    },
    units: [
      {
        id: 'axefighter',
        name: 'Axefighter',
        art: 'dwarf_axefighter',
        sheet: 'dwarven_axefighter',
        tier: 1,
        cost: 60,
        train: 4,
        count: 1,
        hp: 220,
        speed: 1,
        damage: 22,
        range: 1,
        cooldown: 1.2,
      },
      {
        id: 'thane',
        name: 'Thane',
        art: 'dwarf_thane',
        sheet: 'thane',
        tier: 2,
        cost: 170,
        train: 7,
        count: 1,
        hp: 700,
        speed: 0.8,
        damage: 45,
        range: 1,
        cooldown: 1.5,
      },
    ],
    towers: [
      {
        id: 'ballista',
        name: 'Ballista',
        art: 'dwarf_ballista_tower',
        tier: 1,
        cost: 90,
        hp: 400,
        range: 5,
        damage: 40,
        cooldown: 2,
        splash: 0,
        reach: 3,
      },
      {
        id: 'cannon',
        name: 'Cannon Tower',
        art: 'dwarf_cannon_tower',
        tier: 2,
        cost: 180,
        hp: 600,
        range: 4.5,
        damage: 70,
        cooldown: 2.8,
        splash: 1.5,
        reach: 2,
      },
    ],
  },
  legion: {
    id: 'legion',
    name: 'Germanic',
    blurb: 'Balanced. Dependable towers, sturdy troops and a fast heavy rider.',
    color: 0xb82024,
    castle: {
      art: 'teuton_castle',
      hp: 1500,
      reach: [6, 9, 13],
      upgrades: [120, 260],
      pay: [0, 3, 7],
      hpPerLevel: 400,
      range: 3.5,
      damage: 9,
      cooldown: 1,
    },
    units: [
      {
        id: 'warrior',
        name: 'Warrior',
        art: 'germanic_warrior',
        sheet: 'germanic_warrior',
        tier: 1,
        cost: 30,
        train: 2.5,
        count: 1,
        hp: 90,
        speed: 1.4,
        damage: 10,
        range: 1,
        cooldown: 1,
      },
      {
        id: 'ritter',
        name: 'Ritter',
        art: 'teuton_ritter',
        sheet: 'teuton_ritter',
        tier: 2,
        cost: 85,
        train: 4,
        count: 1,
        hp: 240,
        speed: 2.2,
        damage: 20,
        range: 1,
        cooldown: 1.1,
      },
    ],
    towers: [
      {
        id: 'watch',
        name: 'Watch Tower',
        art: 'teuton_watch_tower',
        tier: 1,
        cost: 50,
        hp: 220,
        range: 3.5,
        damage: 9,
        cooldown: 0.8,
        splash: 0,
        reach: 3,
      },
      {
        id: 'catapult',
        name: 'Catapult',
        art: 'teuton_catapult_tower',
        tier: 2,
        cost: 120,
        hp: 300,
        range: 6,
        damage: 55,
        cooldown: 3.2,
        splash: 1.2,
        reach: 2,
      },
    ],
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];
