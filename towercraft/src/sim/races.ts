// The three races, as data (Pixi-free). Each has a castle that can be upgraded twice, three tiers of units trained there and a
// handful of towers built within the castle's reach. What makes a race is how its numbers trade off and which roles it has
// (see CLAUDE.md for the plan to grow them); the ids name the role, the display names the Wyrmsun faction:
//   swarm  (Goblins) fast, weak, many: cheap units in pairs, cloaked thieves, bat gliders in the air; poison and a buffing temple.
//   titan  (Dwarves) slow, strong, costly: few big units and gryphons in the air; long-range towers, a tough bunker, a healing shrine.
//   legion (Germanic) the middle road: archers that shoot the air, sturdy troops; balanced towers, a lookout and a healing church.
// A tower is one of: an attacker (hits ground, air or both; maybe area damage, poison), a buffer/healer (an aura round it) or a
// detector (reveals cloaked units). Units may fly (the straight line between castles), be cloaked (unseen without a detector)
// and shoot the air. `art` names a picture in towercraft/public/art (CREDITS.md there); a unit's `sheet` is its animated sheet.
// Distances are cells, times seconds, costs gold. A unit's `range` is how far its attack reaches (about 1 = melee).

export type RaceId = 'swarm' | 'titan' | 'legion';

/** How a unit's sprite sheet is laid out (main.ts has the frame rows of each). */
export type SheetKind = 'foot' | 'archer' | 'gryphon' | 'glider';

export interface UnitDef {
  id: string;
  name: string;
  art: string;
  sheet: string;
  kind: SheetKind;
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
  /** Flies the straight line between the castles, over the road; only air-capable attackers can hit it. */
  air?: boolean;
  /** Cannot be seen, and so not attacked, unless a detector is near. */
  cloak?: boolean;
  /** Can attack air units (default: ground only). */
  hitsAir?: boolean;
  /** How far (cells) it sees while it lives: it clears fog round it, never the build area; at least its `range`. */
  sight: number;
}

/** What a tower can shoot. */
export type Hits = 'ground' | 'air' | 'both';

export interface Aura {
  /** `power`: friendly towers and units inside deal `amount` (a fraction, 0.3 = +30%) more damage. `heal`: they regain `amount` hp a second. */
  kind: 'power' | 'heal';
  radius: number;
  amount: number;
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
  /** 0 for a tower that only supports (an aura, a detector). */
  damage: number;
  cooldown: number;
  /** What it can hit. */
  hits: Hits;
  /** Cells round the target that also take the damage (0 = just the target). */
  splash: number;
  /** Poison: what it hits burns for `dps` a second for `seconds` more (it does not stack, it renews). */
  dot?: { dps: number; seconds: number };
  /** An aura round the tower, for friendly towers and units. */
  aura?: Aura;
  /** Reveals cloaked enemy units within this many cells, to its owner's towers, units and castle. */
  detect?: number;
  /** Cells round this tower where more may be built (0 = it extends nothing): how a front line is pushed forward. */
  reach: number;
  /** How far (cells) it sees, for as long as it stands (not where more may be built): at least `range`, `detect` and the aura radius. */
  sight: number;
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
  /** The castle shoots the nearest enemy unit in range (air too), and sees cloaked ones within `detect`. */
  range: number;
  damage: number;
  cooldown: number;
  detect: number;
  /** How far (cells) the castle sees: at least its level 1 `reach`, and its attack and detection. */
  sight: number;
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

type UnitInit = Omit<UnitDef, 'count' | 'range' | 'kind'> & Partial<Pick<UnitDef, 'count' | 'range' | 'kind'>>;
const unit = (u: UnitInit): UnitDef => ({ count: 1, range: 1, kind: 'foot', ...u });
type TowerInit = Omit<TowerDef, 'splash' | 'hits' | 'damage' | 'cooldown' | 'range'> &
  Partial<Pick<TowerDef, 'splash' | 'hits' | 'damage' | 'cooldown' | 'range'>>;
const tower = (t: TowerInit): TowerDef => ({ splash: 0, hits: 'both', damage: 0, cooldown: 1, range: 0, ...t });

export const RACES: Record<RaceId, Race> = {
  swarm: {
    id: 'swarm',
    name: 'Goblins',
    blurb: 'Fast, weak and many. Cloaked thieves, bat gliders, poison and a buffing temple; cheap everything.',
    color: 0xe7682f,
    castle: {
      art: 'goblin_castle',
      hp: 900,
      reach: [6, 9, 13],
      upgrades: [90, 190],
      pay: [0, 3, 6],
      hpPerLevel: 200,
      range: 2.5,
      damage: 5,
      cooldown: 0.8,
      detect: 3,
      sight: 8,
    },
    units: [
      unit({
        id: 'spearman',
        name: 'Goblin Spearmen',
        sight: 4.5,
        art: 'goblin_spearman',
        sheet: 'goblin_spearman',
        tier: 1,
        cost: 30,
        train: 0.6,
        count: 3,
        hp: 45,
        speed: 3.6,
        damage: 6,
        cooldown: 0.9,
      }),
      unit({
        id: 'thief',
        name: 'Goblin Thieves',
        sight: 4.5,
        art: 'goblin_thief',
        sheet: 'goblin_thief',
        tier: 2,
        cost: 60,
        train: 0.8,
        count: 2,
        hp: 40,
        speed: 5,
        damage: 8,
        cooldown: 0.8,
        cloak: true,
      }),
      unit({
        id: 'glider',
        name: 'Glider',
        sight: 7,
        art: 'goblin_glider',
        sheet: 'glider',
        kind: 'glider',
        tier: 3,
        cost: 80,
        train: 1.6,
        hp: 110,
        speed: 6.2,
        damage: 14,
        cooldown: 0.9,
        air: true,
      }),
    ],
    towers: [
      tower({
        id: 'nest',
        name: 'Watch Nest',
        sight: 4.5,
        art: 'goblin_watch_tower',
        tier: 1,
        cost: 34,
        hp: 120,
        range: 3,
        damage: 5,
        cooldown: 0.45,
        reach: 3,
      }),
      tower({
        id: 'spitter',
        name: 'Poison Pit',
        sight: 5,
        art: 'goblin_guard_tower',
        tier: 2,
        cost: 70,
        hp: 200,
        range: 3.5,
        damage: 3,
        cooldown: 1,
        hits: 'ground',
        splash: 1,
        dot: { dps: 6, seconds: 4 },
        reach: 2,
      }),
      tower({
        id: 'temple',
        name: 'Shaman Temple',
        sight: 5,
        art: 'goblin_temple',
        tier: 2,
        cost: 80,
        hp: 220,
        aura: { kind: 'power', radius: 4, amount: 0.3 },
        reach: 2,
      }),
      tower({
        id: 'academy',
        name: 'Seer Academy',
        sight: 6,
        art: 'goblin_academy',
        tier: 2,
        cost: 40,
        hp: 150,
        detect: 5,
        reach: 3,
      }),
      tower({
        id: 'catapult',
        name: 'Catapult',
        sight: 7.5,
        art: 'goblin_catapult_tower',
        tier: 3,
        cost: 160,
        hp: 260,
        range: 6.5,
        damage: 36,
        cooldown: 3,
        hits: 'ground',
        splash: 0.8,
        reach: 2,
      }),
    ],
  },
  titan: {
    id: 'titan',
    name: 'Dwarves',
    blurb: 'Slow, strong and costly. Armoured giants and gryphons; long-range guns, a tough bunker, a healing shrine.',
    color: 0x406181,
    castle: {
      art: 'dwarf_castle',
      hp: 1000,
      reach: [6, 9, 13],
      upgrades: [130, 290],
      pay: [0, 4, 9],
      hpPerLevel: 200,
      range: 2.8,
      damage: 14,
      cooldown: 1.4,
      detect: 3,
      sight: 8,
    },
    units: [
      unit({
        id: 'axefighter',
        name: 'Axefighter',
        sight: 4.5,
        art: 'dwarf_axefighter',
        sheet: 'dwarven_axefighter',
        tier: 1,
        cost: 48,
        train: 1.6,
        hp: 220,
        speed: 2.2,
        damage: 22,
        cooldown: 1.2,
      }),
      unit({
        id: 'thane',
        name: 'Thane',
        sight: 4.5,
        art: 'dwarf_thane',
        sheet: 'thane',
        tier: 2,
        cost: 135,
        train: 2.8,
        hp: 700,
        speed: 1.8,
        damage: 52,
        cooldown: 1.5,
      }),
      unit({
        id: 'gryphon',
        name: 'Gryphon Rider',
        sight: 7,
        art: 'dwarf_gryphon',
        sheet: 'gryphon_rider',
        kind: 'gryphon',
        tier: 3,
        cost: 220,
        train: 2.8,
        hp: 360,
        speed: 6,
        damage: 26,
        cooldown: 1.2,
        air: true,
        hitsAir: true,
      }),
    ],
    towers: [
      tower({
        id: 'ballista',
        name: 'Ballista',
        sight: 6.5,
        art: 'dwarf_ballista_tower',
        tier: 1,
        cost: 110,
        hp: 400,
        range: 5,
        damage: 30,
        cooldown: 2,
        hits: 'ground',
        reach: 3,
      }),
      tower({
        id: 'bunker',
        name: 'Guard Bunker',
        sight: 4.5,
        art: 'dwarf_guard_tower',
        tier: 2,
        cost: 110,
        hp: 900,
        range: 3,
        damage: 16,
        cooldown: 0.9,
        reach: 2,
      }),
      tower({
        id: 'cannon',
        name: 'Cannon Tower',
        sight: 6,
        art: 'dwarf_cannon_tower',
        tier: 2,
        cost: 200,
        hp: 600,
        range: 4.5,
        damage: 48,
        cooldown: 2.8,
        hits: 'ground',
        splash: 1,
        reach: 2,
      }),
      tower({
        id: 'skyguard',
        name: 'Skyguard',
        sight: 6.5,
        art: 'dwarf_sentry_tower',
        tier: 2,
        cost: 100,
        hp: 300,
        range: 5,
        damage: 22,
        cooldown: 0.7,
        hits: 'air',
        reach: 2,
      }),
      tower({
        id: 'shrine',
        name: 'Rune Shrine',
        sight: 5.5,
        art: 'dwarf_temple',
        tier: 3,
        cost: 160,
        hp: 500,
        aura: { kind: 'heal', radius: 4, amount: 8 },
        detect: 4,
        reach: 3,
      }),
    ],
  },
  legion: {
    id: 'legion',
    name: 'Germanic',
    blurb:
      'Balanced. Archers that shoot the air, sturdy troops and a fast heavy rider; a lookout and a healing church.',
    color: 0xb82024,
    castle: {
      art: 'teuton_castle',
      hp: 850,
      reach: [6, 9, 13],
      upgrades: [100, 220],
      pay: [0, 4, 8],
      hpPerLevel: 200,
      range: 2.8,
      damage: 9,
      cooldown: 1,
      detect: 3,
      sight: 8,
    },
    units: [
      unit({
        id: 'warrior',
        name: 'Warrior',
        sight: 4.5,
        art: 'germanic_warrior',
        sheet: 'germanic_warrior',
        tier: 1,
        cost: 28,
        train: 1,
        hp: 140,
        speed: 2.8,
        damage: 12,
        cooldown: 1,
      }),
      unit({
        id: 'archer',
        name: 'Archer',
        sight: 6,
        art: 'germanic_archer',
        sheet: 'germanic_archer',
        kind: 'archer',
        tier: 2,
        cost: 36,
        train: 1.2,
        hp: 90,
        speed: 3,
        damage: 12,
        range: 4,
        cooldown: 1,
        hitsAir: true,
      }),
      unit({
        id: 'ritter',
        name: 'Ritter',
        sight: 5,
        art: 'teuton_ritter',
        sheet: 'teuton_ritter',
        tier: 3,
        cost: 72,
        train: 1.6,
        hp: 400,
        speed: 4.4,
        damage: 28,
        cooldown: 1.1,
      }),
    ],
    towers: [
      tower({
        id: 'watch',
        name: 'Watch Tower',
        sight: 5,
        art: 'teuton_watch_tower',
        tier: 1,
        cost: 50,
        hp: 220,
        range: 3.5,
        damage: 11,
        cooldown: 0.8,
        reach: 3,
      }),
      tower({
        id: 'guard',
        name: 'Archer Tower',
        sight: 6,
        art: 'teuton_guard_tower',
        tier: 2,
        cost: 100,
        hp: 340,
        range: 4.5,
        damage: 14,
        cooldown: 1,
        reach: 2,
      }),
      tower({
        id: 'catapult',
        name: 'Catapult',
        sight: 7.5,
        art: 'teuton_catapult_tower',
        tier: 2,
        cost: 130,
        hp: 300,
        range: 6,
        damage: 40,
        cooldown: 3.2,
        hits: 'ground',
        splash: 0.8,
        reach: 2,
      }),
      tower({
        id: 'lookout',
        name: 'Lookout',
        sight: 7,
        art: 'teuton_university',
        tier: 2,
        cost: 45,
        hp: 160,
        detect: 5,
        reach: 4,
      }),
      tower({
        id: 'church',
        name: 'Church',
        sight: 5,
        art: 'teuton_church',
        tier: 3,
        cost: 150,
        hp: 400,
        aura: { kind: 'heal', radius: 4, amount: 5 },
        reach: 2,
      }),
    ],
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];
