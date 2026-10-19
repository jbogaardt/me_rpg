// The three races, as data (Pixi-free). Each has two towers and two units; what makes a race is how its numbers trade
// off, not special rules:
//   swarm  fast, weak, many: cheap units that come in threes and outrun slow towers; towers are cheap and short-ranged.
//   titan  slow, strong, expensive: few big units that soak up shots; towers hit hard from afar but cost a lot.
//   legion the middle road on every axis, and the yardstick the other two are tuned against.
// Costs are gold. A unit's `income` is gold added to its sender's pay every pay day for the rest of the game, so
// sending is an investment as well as an attack. `leak` is the lives it takes from the defender when it gets through.

export type RaceId = 'swarm' | 'titan' | 'legion';

export interface UnitDef {
  id: string;
  name: string;
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
    name: 'Swarm',
    blurb: 'Fast, weak and many. Floods the road before towers can turn.',
    color: 0xe7682f,
    units: [
      { id: 'skitter', name: 'Skitters', hp: 18, speed: 3.2, cost: 12, count: 3, income: 1, leak: 1 },
      { id: 'runner', name: 'Runners', hp: 45, speed: 4.2, cost: 30, count: 3, income: 3, leak: 1 },
    ],
    towers: [
      { id: 'dart', name: 'Dart Nest', cost: 25, range: 2.5, damage: 4, cooldown: 0.4, splash: 0 },
      { id: 'spitter', name: 'Spitter', cost: 60, range: 3, damage: 3, cooldown: 0.25, splash: 0 },
    ],
  },
  titan: {
    id: 'titan',
    name: 'Titan',
    blurb: 'Slow, strong and costly. A few giants that shrug off towers.',
    color: 0x406181,
    units: [
      { id: 'brute', name: 'Brute', hp: 400, speed: 0.9, cost: 60, count: 1, income: 3, leak: 1 },
      { id: 'colossus', name: 'Colossus', hp: 1500, speed: 0.7, cost: 220, count: 1, income: 12, leak: 3 },
    ],
    towers: [
      { id: 'ballista', name: 'Ballista', cost: 70, range: 4.5, damage: 45, cooldown: 1.8, splash: 0 },
      { id: 'mortar', name: 'Mortar', cost: 160, range: 4, damage: 60, cooldown: 2.5, splash: 1.6 },
    ],
  },
  legion: {
    id: 'legion',
    name: 'Legion',
    blurb: 'Balanced. Dependable towers and sturdy, steady troops.',
    color: 0xb82024,
    units: [
      { id: 'footman', name: 'Footman', cost: 20, hp: 60, speed: 1.6, count: 1, income: 1, leak: 1 },
      { id: 'knight', name: 'Knight', cost: 70, hp: 220, speed: 1.2, count: 1, income: 4, leak: 1 },
    ],
    towers: [
      { id: 'archer', name: 'Archer Tower', cost: 40, range: 3, damage: 8, cooldown: 0.8, splash: 0 },
      { id: 'cannon', name: 'Cannon', cost: 90, range: 3.5, damage: 30, cooldown: 2, splash: 1.2 },
    ],
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];
