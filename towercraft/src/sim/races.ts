// The three races, as data (Pixi-free). Each has two towers and two units; what makes a race is how its numbers trade
// off, not special rules (the ids name the role, the display names the Wyrmsun faction that dresses it):
//   swarm  (Goblins) fast, weak, many: cheap units that come in threes and outrun slow towers; towers are cheap and short-ranged.
//   titan  (Dwarves) slow, strong, expensive: few big units that soak up shots; towers hit hard from afar but cost a lot.
//   legion (Germanic) the middle road on every axis, and the yardstick the other two are tuned against.
// `art` names a picture in towercraft/public/art (CREDITS.md there): a unit's portrait, a tower's sprite sheet; a unit's `sheet` is its
// animated sprite sheet in art/units.
// Costs are gold. A unit's `income` is gold added to its sender's pay every pay day for the rest of the game, so
// sending is an investment as well as an attack. `leak` is the lives it takes from the defender when it gets through.

export type RaceId = 'swarm' | 'titan' | 'legion';

export interface UnitDef {
  id: string;
  name: string;
  art: string;
  /** The animated sprite sheet (art/units/<sheet>.png). */
  sheet: string;
  hp: number;
  /** Cells per second. */
  speed: number;
  cost: number;
  /** How many walk out for one purchase. */
  count: number;
  income: number;
  leak: number;
}

export interface TowerDef {
  id: string;
  name: string;
  art: string;
  cost: number;
  /** Cells. */
  range: number;
  damage: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Cells round the target that also take the damage (0 = just the target). */
  splash: number;
}

export interface Race {
  id: RaceId;
  name: string;
  blurb: string;
  color: number;
  units: UnitDef[];
  towers: TowerDef[];
}

export const RACES: Record<RaceId, Race> = {
  swarm: {
    id: 'swarm',
    name: 'Goblins',
    blurb: 'Fast, weak and many. Floods the road before towers can turn.',
    color: 0xe7682f,
    units: [
      {
        id: 'skitter',
        name: 'Goblin Spearmen',
        art: 'goblin_spearman',
        sheet: 'goblin_spearman',
        hp: 18,
        speed: 3.2,
        cost: 12,
        count: 3,
        income: 1,
        leak: 1,
      },
      {
        id: 'runner',
        name: 'Goblin Thieves',
        art: 'goblin_thief',
        sheet: 'goblin_thief',
        hp: 45,
        speed: 4.2,
        cost: 30,
        count: 3,
        income: 3,
        leak: 1,
      },
    ],
    towers: [
      {
        id: 'dart',
        name: 'Watch Nest',
        art: 'goblin_watch_tower',
        cost: 25,
        range: 2.5,
        damage: 4,
        cooldown: 0.4,
        splash: 0,
      },
      {
        id: 'spitter',
        name: 'Guard Tower',
        art: 'goblin_guard_tower',
        cost: 60,
        range: 3,
        damage: 3,
        cooldown: 0.25,
        splash: 0,
      },
    ],
  },
  titan: {
    id: 'titan',
    name: 'Dwarves',
    blurb: 'Slow, strong and costly. A few armoured giants that shrug off towers.',
    color: 0x406181,
    units: [
      {
        id: 'brute',
        name: 'Axefighter',
        art: 'dwarf_axefighter',
        sheet: 'dwarven_axefighter',
        hp: 400,
        speed: 0.9,
        cost: 60,
        count: 1,
        income: 3,
        leak: 1,
      },
      {
        id: 'colossus',
        name: 'Thane',
        art: 'dwarf_thane',
        sheet: 'thane',
        hp: 1500,
        speed: 0.7,
        cost: 220,
        count: 1,
        income: 12,
        leak: 3,
      },
    ],
    towers: [
      {
        id: 'ballista',
        name: 'Ballista',
        art: 'dwarf_ballista_tower',
        cost: 70,
        range: 4.5,
        damage: 45,
        cooldown: 1.8,
        splash: 0,
      },
      {
        id: 'mortar',
        name: 'Cannon Tower',
        art: 'dwarf_cannon_tower',
        cost: 160,
        range: 4,
        damage: 60,
        cooldown: 2.5,
        splash: 1.6,
      },
    ],
  },
  legion: {
    id: 'legion',
    name: 'Germanic',
    blurb: 'Balanced. Dependable towers and sturdy, steady troops.',
    color: 0xb82024,
    units: [
      {
        id: 'footman',
        name: 'Warrior',
        art: 'germanic_warrior',
        sheet: 'germanic_warrior',
        cost: 20,
        hp: 60,
        speed: 1.6,
        count: 1,
        income: 1,
        leak: 1,
      },
      {
        id: 'knight',
        name: 'Ritter',
        art: 'teuton_ritter',
        sheet: 'teuton_ritter',
        cost: 70,
        hp: 220,
        speed: 1.2,
        count: 1,
        income: 4,
        leak: 1,
      },
    ],
    towers: [
      {
        id: 'archer',
        name: 'Watch Tower',
        art: 'teuton_watch_tower',
        cost: 40,
        range: 3,
        damage: 8,
        cooldown: 0.8,
        splash: 0,
      },
      {
        id: 'cannon',
        name: 'Catapult',
        art: 'teuton_catapult_tower',
        cost: 90,
        range: 3.5,
        damage: 30,
        cooldown: 2,
        splash: 1.2,
      },
    ],
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];
