// The three races, as data (Pixi-free). Each has a castle that can be upgraded twice, a base unit the castle trains by itself, and
// buildings ("towers") built beside the road within the castle's reach. What makes a race is how its numbers trade off and which
// roles it has; the ids name the role, the display names the Wyrmsun faction:
//   swarm  (Goblins) fast, weak, many: cheap units in groups, archers, suicide boomers, cloaked thieves, bats; poison and a buffing temple.
//   titan  (Dwarves) slow, strong, costly: few big units, gun and flame carriers, gryphons; long-range towers, a tough bunker, a healing shrine.
//   legion (Germanic) the middle road: archers that shoot the air, sturdy troops, sappers and catapults, falcons and griffins.
// Everything is bought with two currencies, `wood` and `stone`, and there is no wait: a purchase is instant.
// A building is one of: an attacker (hits ground, air or both; maybe area damage, poison), a buffer/healer (an aura round it), a
// detector (reveals cloaked units), a bunker (loaded with ranged units that shoot from it), a producer (`trains`: the units that are
// unlocked while it stands), an economy building (`econ`: wood or stone every pay day) or a smithy (it hosts upgrades: `UpgradeDef.needs`).
// Units walk the road (flyers too); they may be cloaked (unseen without a detector), shoot the air, hit several foes at once (`multi`),
// hit an area (`splash`) or blow themselves up (`suicide`). `art` names a picture in towercraft/public/art (CREDITS.md there); a
// unit's `sheet` is its animated sheet. Distances are cells, times seconds. A unit's `range` is how far its attack reaches (about 1 = melee).
// The numbers below are written for fields `REACH_SCALE` times smaller than the ones played on: `RACES` (what the rest of the game
// reads) is them with every distance and speed stretched by it, so towers cover more road and the fields have room for more buildings
// without changing how a match balances (see `scaled`).

export type RaceId = 'swarm' | 'titan' | 'legion';

/** What things cost: both currencies at once (a StarCraft-style pair). */
export interface Cost {
  wood: number;
  stone: number;
}
export const price = (wood: number, stone = 0): Cost => ({ wood, stone });

/** How a unit's sprite sheet is laid out (main.ts has the frame rows of each). */
export type SheetKind = 'foot' | 'archer' | 'gryphon' | 'glider' | 'bat' | 'bigbat' | 'engine';

export interface UnitDef {
  id: string;
  name: string;
  /** A portrait in art/ (omitted: the picture is cut from the unit's own sheet). */
  art?: string;
  sheet: string;
  kind: SheetKind;
  /** Castle level needed to buy it. */
  tier: number;
  /** The building that must stand for the unit to be bought (the castle's own base unit needs none). */
  needs?: string;
  cost: Cost;
  /** How many walk out for one purchase. */
  count: number;
  hp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  /** Flies over the road (it still follows it); only air-capable attackers can hit it. */
  air?: boolean;
  /** Cannot be seen, and so not attacked, unless a detector is near. */
  cloak?: boolean;
  /** Can attack air units (default: ground only). */
  hitsAir?: boolean;
  /** Cells round the thing it hits that take the damage too: a blast, a trample (units and, if it may attack towers, towers). */
  splash?: number;
  /** One blow strikes up to this many enemy units within range at once (a flame, a sweeping blade). */
  multi?: number;
  /** Damage against towers and castles is multiplied by this (default 1): siege units and bombs. */
  siege?: number;
  /** Dies as it strikes (a bomb): its blast goes off once and it is gone. */
  suicide?: boolean;
  /** May be loaded into a bunker (default: any ground unit that is not a bomb): a ranged one shoots from there with the bunker's range bonus, a melee one strikes foes close to the walls. */
  garrison?: boolean;
  /** How far (cells) it sees while it lives: it clears fog round it, never the build area; at least its `range`. */
  sight: number;
  /** A re-skin of a sheet the race shares: drawn this big and tinted (the picture, not the rules). */
  look?: { scale?: number; tint?: number };
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
  cost: Cost;
  /** Another building (its id) that must stand before this one can be built: a tech tree. */
  needs?: string;
  /** At most this many may stand at once. */
  limit?: number;
  hp: number;
  range: number;
  /** 0 for a building that only supports (an aura, a detector, a producer, a mill). */
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
  /** A bunker: `slots` ranged units can be loaded, each shooting from the bunker with `rangeBonus` cells more reach. */
  bunker?: { slots: number; rangeBonus: number };
  /** A producer: while it stands the owner may buy these units (ids). */
  trains?: string[];
  /** An economy building: this much more of each currency on every pay day. */
  econ?: Partial<Cost>;
  /** Cells round this tower where more may be built (0 = it extends nothing): how a front line is pushed forward. */
  reach: number;
  /** How far (cells) it sees, for as long as it stands (not where more may be built): at least `range`, `detect` and the aura radius. */
  sight: number;
}

/** A line of upgrades bought at a building: each level makes one class of unit (all ground or all air) stronger for good. */
export interface UpgradeDef {
  id: string;
  name: string;
  applies: 'ground' | 'air';
  stat: 'damage' | 'hp';
  /** What one level adds (a fraction, 0.15 = +15%): levels add up. */
  perLevel: number;
  /** The building (its id) that must stand. */
  needs: string;
  /** Each level: its price and the castle level needed. */
  levels: { cost: Cost; tier: number }[];
}

export interface CastleDef {
  art: string;
  hp: number;
  /** Cells round the castle where towers may be built, by castle level (1, 2, 3). */
  reach: number[];
  /** What it costs to go up from level 1 to 2, and 2 to 3. */
  upgrades: Cost[];
  /** The buildings that must stand for each of those upgrades (`CASTLE_NEEDS`), besides the cost. */
  needs: UpgradeNeed[][];
  /** Income (per pay day) by castle level, before the mills and quarries. */
  income: Cost[];
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
  upgrades: UpgradeDef[];
}

export const MAX_LEVEL = 3;

/** What a building is for: money, unlocking units, upgrades at a smithy, or defending (shooting, an aura, a detector, a bunker). */
export type Role = 'econ' | 'producer' | 'smithy' | 'defence';
export const roleOf = (t: Pick<TowerDef, 'econ' | 'trains' | 'damage' | 'bunker' | 'aura' | 'detect'>): Role =>
  t.econ ? 'econ' : t.trains ? 'producer' : t.damage > 0 || t.bunker || t.aura || t.detect ? 'defence' : 'smithy';

/** A castle upgrade asks for this many standing buildings of a role (of at least a castle `tier`): a base that grew in order, not only paid. */
export interface UpgradeNeed {
  role: Role;
  count: number;
  tier?: number;
}
/** What each upgrade asks of the buildings: `[level 1 to 2, level 2 to 3]`: towers only (economy has its own reasons to be built, and rushing a level is a risk the player takes). The same for every race (roles, not ids). */
export const CASTLE_NEEDS: UpgradeNeed[][] = [
  [{ role: 'defence', count: 2 }],
  [{ role: 'defence', count: 3, tier: 2 }],
];

type UnitInit = Omit<UnitDef, 'count' | 'range' | 'kind'> & Partial<Pick<UnitDef, 'count' | 'range' | 'kind'>>;
const unit = (u: UnitInit): UnitDef => ({ count: 1, range: 1, kind: 'foot', garrison: !u.air && !u.suicide, ...u });
type TowerInit = Omit<TowerDef, 'splash' | 'hits' | 'damage' | 'cooldown' | 'range'> &
  Partial<Pick<TowerDef, 'splash' | 'hits' | 'damage' | 'cooldown' | 'range'>>;
const tower = (t: TowerInit): TowerDef => ({ splash: 0, hits: 'both', damage: 0, cooldown: 1, range: 0, ...t });

/** The three levels of one line of upgrades: `base` is level 1's price, each next level costs this much more again. */
const levels = (base: Cost, tiers: [number, number, number] = [1, 2, 3]) =>
  tiers.map((tier, i) => ({
    tier,
    cost: price(Math.round(base.wood * (1 + i * 0.8)), Math.round(base.stone * (1 + i * 1.1))),
  }));

/** Mills and quarries: the same everywhere (what differs is the picture and the price). */
const MILL_WOOD = 6;
/** How many of each unit-producing building a seat may have: each is a camp its units walk out from. */
export const PRODUCER_LIMIT = 4;
const QUARRY_STONE = 8;

/** The tables as written: the numbers for a field `REACH_SCALE` times smaller (the unit tests play these on the classic drawn field). */
export const DRAWN_RACES: Record<RaceId, Race> = {
  swarm: {
    id: 'swarm',
    name: 'Goblins',
    blurb:
      'Fast, weak and many. Boomers that blow themselves up, archers, cloaked thieves, bats and poison; cheap everything.',
    color: 0xe7682f,
    castle: {
      art: 'goblin_castle',
      hp: 900,
      reach: [6, 9, 13],
      upgrades: [price(70, 40), price(150, 110)],
      needs: CASTLE_NEEDS,
      income: [price(16, 11), price(19, 13), price(22, 15)],
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
        cost: price(30),
        count: 3,
        hp: 123,
        speed: 3.6,
        damage: 6,
        cooldown: 0.5,
      }),
      unit({
        id: 'archer',
        name: 'Goblin Archers',
        sight: 6,
        sheet: 'goblin_archer',
        kind: 'archer',
        tier: 1,
        needs: 'hatchery',
        cost: price(60, 25),
        count: 2,
        hp: 280,
        speed: 3.3,
        damage: 12,
        range: 4,
        cooldown: 0.63,
        hitsAir: true,
        garrison: true,
      }),
      unit({
        id: 'boomer',
        name: 'Boomers',
        sight: 4,
        sheet: 'gunpowder_infantry',
        tier: 1,
        needs: 'hatchery',
        cost: price(20, 25),
        count: 2,
        hp: 105,
        speed: 3.1,
        damage: 54,
        splash: 1.6,
        siege: 2.5,
        suicide: true,
        cooldown: 1,
      }),
      unit({
        id: 'thief',
        name: 'Goblin Thieves',
        sight: 4.5,
        art: 'goblin_thief',
        sheet: 'goblin_thief',
        tier: 2,
        needs: 'den',
        cost: price(50, 50),
        hp: 420,
        speed: 2.8,
        damage: 48,
        cooldown: 1.25,
        cloak: true,
      }),
      unit({
        id: 'swordsman',
        name: 'Goblin Swordsman',
        sight: 4.5,
        sheet: 'goblin_swordsman',
        tier: 2,
        needs: 'den',
        cost: price(40),
        hp: 560,
        speed: 2.8,
        damage: 19,
        range: 1.4,
        multi: 3,
        cooldown: 0.86,
      }),
      unit({
        id: 'glider',
        name: 'Glider',
        sight: 7,
        art: 'goblin_glider',
        sheet: 'glider',
        kind: 'glider',
        tier: 2,
        needs: 'aerie',
        cost: price(40, 50),
        hp: 420,
        speed: 6,
        damage: 11,
        hitsAir: true,
        cooldown: 1.1,
        air: true,
      }),
      unit({
        id: 'bombbat',
        name: 'Bomb Bats',
        sight: 7,
        sheet: 'bat',
        kind: 'bat',
        tier: 2,
        needs: 'aerie',
        cost: price(20, 75),
        count: 2,
        hp: 88,
        speed: 6,
        damage: 66,
        splash: 1.8,
        siege: 3,
        suicide: true,
        cooldown: 1,
        air: true,
      }),
      unit({
        id: 'dreadbat',
        name: 'Dread Bat',
        sight: 7,
        sheet: 'dread_bat',
        kind: 'bigbat',
        tier: 3,
        needs: 'roost',
        cost: price(60, 100),
        hp: 875,
        speed: 4.4,
        damage: 30,
        splash: 1.2,
        cooldown: 1.9,
        air: true,
        hitsAir: true,
      }),
    ],
    towers: [
      tower({
        id: 'mill',
        name: 'Lumber Hut',
        sight: 4,
        art: 'goblin_lumber_mill',
        tier: 1,
        cost: price(36, 9),
        limit: 3,
        hp: 140,
        econ: { wood: MILL_WOOD },
        reach: 0,
      }),
      tower({
        id: 'quarry',
        name: 'Stone Pit',
        sight: 4,
        art: 'goblin_masons_shop',
        tier: 1,
        cost: price(31, 16),
        limit: 3,
        hp: 140,
        econ: { stone: QUARRY_STONE },
        reach: 0,
      }),
      tower({
        id: 'hatchery',
        name: 'Hatchery',
        sight: 4,
        art: 'goblin_mess_hall',
        tier: 1,
        cost: price(45, 9),
        limit: PRODUCER_LIMIT,
        hp: 220,
        trains: ['archer', 'boomer'],
        reach: 0,
      }),
      tower({
        id: 'den',
        name: 'Thieves Den',
        sight: 4,
        art: 'goblin_town_hall',
        tier: 2,
        cost: price(50, 27),
        limit: PRODUCER_LIMIT,
        hp: 260,
        trains: ['thief', 'swordsman'],
        reach: 0,
      }),
      tower({
        id: 'aerie',
        name: 'Bat Aerie',
        sight: 4,
        art: 'goblin_farm',
        tier: 2,
        cost: price(54, 36),
        limit: PRODUCER_LIMIT,
        hp: 240,
        trains: ['glider', 'bombbat'],
        reach: 0,
      }),
      tower({
        id: 'roost',
        name: 'Dread Roost',
        sight: 4,
        art: 'goblin_fortress',
        tier: 3,
        needs: 'aerie',
        cost: price(72, 63),
        limit: PRODUCER_LIMIT,
        hp: 320,
        trains: ['dreadbat'],
        reach: 0,
      }),
      tower({
        id: 'smithy',
        name: 'Bone Smithy',
        sight: 4,
        art: 'goblin_smithy',
        tier: 1,
        cost: price(45, 27),
        limit: 1,
        hp: 240,
        reach: 0,
      }),
      tower({
        id: 'nest',
        name: 'Watch Nest',
        sight: 4.5,
        art: 'goblin_watch_tower',
        tier: 1,
        cost: price(16, 14),
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
        cost: price(27, 25),
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
        id: 'skycannon',
        name: 'Sky Cannon',
        sight: 6,
        art: 'goblin_cannon_tower',
        tier: 2,
        cost: price(25, 29),
        hp: 180,
        range: 5,
        damage: 16,
        cooldown: 0.7,
        hits: 'air',
        reach: 2,
      }),
      tower({
        id: 'hut',
        name: 'Skull Hut',
        sight: 4.5,
        art: 'goblin_market',
        tier: 2,
        cost: price(36, 27),
        hp: 420,
        range: 2,
        bunker: { slots: 3, rangeBonus: 1 },
        reach: 2,
      }),
      tower({
        id: 'temple',
        name: 'Shaman Temple',
        sight: 5,
        art: 'goblin_temple',
        tier: 2,
        cost: price(27, 31),
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
        cost: price(18, 13),
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
        cost: price(54, 65),
        hp: 260,
        range: 6.5,
        damage: 36,
        cooldown: 3,
        hits: 'ground',
        splash: 0.8,
        reach: 2,
      }),
    ],
    upgrades: [
      {
        id: 'gdmg',
        name: 'Sharpened Spears',
        applies: 'ground',
        stat: 'damage',
        perLevel: 0.15,
        needs: 'smithy',
        levels: levels(price(40, 20)),
      },
      {
        id: 'ghp',
        name: 'Tough Hides',
        applies: 'ground',
        stat: 'hp',
        perLevel: 0.15,
        needs: 'smithy',
        levels: levels(price(40, 20)),
      },
      {
        id: 'admg',
        name: 'Barbed Claws',
        applies: 'air',
        stat: 'damage',
        perLevel: 0.15,
        needs: 'aerie',
        levels: levels(price(30, 40)),
      },
      {
        id: 'ahp',
        name: 'Bat Wings',
        applies: 'air',
        stat: 'hp',
        perLevel: 0.15,
        needs: 'aerie',
        levels: levels(price(30, 40)),
      },
    ],
  },
  titan: {
    id: 'titan',
    name: 'Dwarves',
    blurb:
      'Slow, strong and costly. Gunners, flame bearers and armoured giants, gryphons; long-range guns, a tough bunker, a healing shrine.',
    color: 0x3f8fd6,
    castle: {
      art: 'dwarf_castle',
      hp: 1000,
      reach: [6, 9, 13],
      upgrades: [price(80, 70), price(170, 170)],
      needs: CASTLE_NEEDS,
      income: [price(18, 14), price(22, 16), price(25, 18)],
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
        cost: price(40),
        hp: 560,
        speed: 2.8,
        damage: 19,
        cooldown: 0.86,
      }),
      unit({
        id: 'thunderer',
        name: 'Thunderer',
        sight: 6.5,
        sheet: 'thunderer',
        tier: 1,
        needs: 'hall',
        cost: price(50, 25),
        hp: 630,
        speed: 3.7,
        damage: 24,
        range: 4,
        cooldown: 1.25,
        hitsAir: true,
        garrison: true,
      }),
      unit({
        id: 'runesmith',
        name: 'Flame Runesmith',
        sight: 4.5,
        sheet: 'runesmith',
        tier: 2,
        needs: 'foundry',
        cost: price(20, 13),
        hp: 175,
        speed: 2.8,
        damage: 10,
        range: 2.8,
        multi: 5,
        cooldown: 0.93,
      }),
      unit({
        id: 'thane',
        name: 'Thane',
        sight: 4.5,
        art: 'dwarf_thane',
        sheet: 'thane',
        tier: 2,
        needs: 'foundry',
        cost: price(40, 75),
        hp: 1225,
        speed: 3.3,
        damage: 36,
        range: 2,
        cooldown: 1.25,
      }),
      unit({
        id: 'yale',
        name: 'Yale Rider',
        sight: 5,
        sheet: 'yale_rider_black_hair_brown_fur',
        tier: 2,
        needs: 'pen',
        cost: price(30),
        hp: 280,
        speed: 5.7,
        damage: 24,
        splash: 0.8,
        cooldown: 1.25,
      }),
      unit({
        id: 'scout',
        name: 'Gryphon Scout',
        sight: 8,
        sheet: 'gryphon_rider_brown_hair_blue_feathers',
        kind: 'gryphon',
        tier: 2,
        needs: 'aviary',
        cost: price(60, 50),
        hp: 420,
        speed: 4.4,
        damage: 14,
        hitsAir: true,
        cooldown: 1,
        air: true,
      }),
      unit({
        id: 'gryphon',
        name: 'Gryphon Rider',
        sight: 7,
        art: 'dwarf_gryphon',
        sheet: 'gryphon_rider',
        kind: 'gryphon',
        tier: 3,
        needs: 'aviary',
        cost: price(110, 63),
        hp: 875,
        speed: 4.4,
        damage: 24,
        cooldown: 1.25,
        air: true,
        hitsAir: true,
      }),
      unit({
        id: 'thundergryphon',
        name: 'Thunder Gryphon',
        sight: 7,
        sheet: 'gryphon_rider_red_hair_gray_feathers',
        kind: 'gryphon',
        tier: 3,
        needs: 'skyforge',
        cost: price(160, 150),
        hp: 1750,
        speed: 2.6,
        damage: 30,
        splash: 1.4,
        siege: 2,
        cooldown: 1.1,
        air: true,
        look: { scale: 1 },
      }),
    ],
    towers: [
      tower({
        id: 'mill',
        name: 'Lumber Mill',
        sight: 4,
        art: 'dwarf_lumber_mill',
        tier: 1,
        cost: price(55, 13),
        limit: 3,
        hp: 220,
        econ: { wood: MILL_WOOD },
        reach: 0,
      }),
      tower({
        id: 'quarry',
        name: 'Stone Quarry',
        sight: 4,
        art: 'dwarf_masons_shop',
        tier: 1,
        cost: price(44, 24),
        limit: 3,
        hp: 220,
        econ: { stone: QUARRY_STONE },
        reach: 0,
      }),
      tower({
        id: 'hall',
        name: 'Warriors Hall',
        sight: 4,
        art: 'dwarf_citadel',
        tier: 1,
        cost: price(62, 35),
        limit: PRODUCER_LIMIT,
        hp: 420,
        trains: ['thunderer'],
        reach: 0,
      }),
      tower({
        id: 'foundry',
        name: 'Rune Foundry',
        sight: 4,
        art: 'dwarf_academy',
        tier: 2,
        cost: price(62, 44),
        limit: PRODUCER_LIMIT,
        hp: 360,
        trains: ['runesmith', 'thane'],
        reach: 0,
      }),
      tower({
        id: 'pen',
        name: 'Yale Pen',
        sight: 4,
        art: 'dwarf_yale_pen',
        tier: 2,
        cost: price(53, 35),
        limit: PRODUCER_LIMIT,
        hp: 320,
        trains: ['yale'],
        reach: 0,
      }),
      tower({
        id: 'aviary',
        name: 'Gryphon Eyrie',
        sight: 4,
        art: 'dwarf_yale_hunting_lodge',
        tier: 2,
        cost: price(62, 53),
        limit: PRODUCER_LIMIT,
        hp: 340,
        trains: ['scout', 'gryphon'],
        reach: 0,
      }),
      tower({
        id: 'skyforge',
        name: 'Sky Forge',
        sight: 4,
        art: 'dwarf_academy',
        tier: 3,
        needs: 'aviary',
        cost: price(88, 88),
        limit: PRODUCER_LIMIT,
        hp: 420,
        trains: ['thundergryphon'],
        reach: 0,
      }),
      tower({
        id: 'smithy',
        name: 'Dwarven Forge',
        sight: 4,
        art: 'dwarf_smithy',
        tier: 1,
        cost: price(66, 55),
        limit: 1,
        hp: 400,
        reach: 0,
      }),
      tower({
        id: 'ballista',
        name: 'Ballista',
        sight: 6.5,
        art: 'dwarf_ballista_tower',
        tier: 1,
        cost: price(55, 66),
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
        cost: price(66, 66),
        hp: 900,
        range: 2.5,
        damage: 6,
        cooldown: 0.9,
        bunker: { slots: 4, rangeBonus: 1 },
        reach: 2,
      }),
      tower({
        id: 'cannon',
        name: 'Cannon Tower',
        sight: 6,
        art: 'dwarf_cannon_tower',
        tier: 2,
        cost: price(88, 132),
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
        cost: price(44, 66),
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
        cost: price(66, 110),
        hp: 500,
        aura: { kind: 'heal', radius: 4, amount: 8 },
        detect: 4,
        reach: 3,
      }),
    ],
    upgrades: [
      {
        id: 'gdmg',
        name: 'Runed Axes',
        applies: 'ground',
        stat: 'damage',
        perLevel: 0.15,
        needs: 'smithy',
        levels: levels(price(50, 40)),
      },
      {
        id: 'ghp',
        name: 'Dwarven Plate',
        applies: 'ground',
        stat: 'hp',
        perLevel: 0.15,
        needs: 'smithy',
        levels: levels(price(50, 40)),
      },
      {
        id: 'admg',
        name: 'Steel Talons',
        applies: 'air',
        stat: 'damage',
        perLevel: 0.15,
        needs: 'aviary',
        levels: levels(price(40, 60)),
      },
      {
        id: 'ahp',
        name: 'Gryphon Barding',
        applies: 'air',
        stat: 'hp',
        perLevel: 0.15,
        needs: 'aviary',
        levels: levels(price(40, 60)),
      },
    ],
  },
  legion: {
    id: 'legion',
    name: 'Germanic',
    blurb:
      'Balanced. Archers that shoot the air, sturdy troops, sappers and catapults, a fast heavy rider, falcons and griffins.',
    color: 0xb82024,
    castle: {
      art: 'teuton_castle',
      hp: 850,
      reach: [6, 9, 13],
      upgrades: [price(70, 55), price(150, 130)],
      needs: CASTLE_NEEDS,
      income: [price(16, 11), price(19, 13), price(22, 15)],
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
        cost: price(40),
        hp: 560,
        speed: 2.8,
        damage: 19,
        cooldown: 0.86,
      }),
      unit({
        id: 'archer',
        name: 'Archer',
        sight: 6,
        art: 'germanic_archer',
        sheet: 'germanic_archer',
        kind: 'archer',
        tier: 1,
        needs: 'barracks',
        cost: price(20),
        hp: 140,
        speed: 2.8,
        damage: 7,
        range: 4,
        cooldown: 0.63,
        hitsAir: true,
        garrison: true,
      }),
      unit({
        id: 'saxon',
        name: 'Saxon Swordsman',
        sight: 4.5,
        sheet: 'saxon_swordsman',
        tier: 2,
        needs: 'barracks',
        cost: price(20, 13),
        hp: 175,
        speed: 2.8,
        damage: 10,
        range: 1.4,
        multi: 3,
        cooldown: 0.93,
      }),
      unit({
        id: 'sapper',
        name: 'Powder Sapper',
        sight: 4,
        sheet: 'austrian_musketeer',
        tier: 2,
        needs: 'workshop',
        cost: price(10, 13),
        hp: 105,
        speed: 3.1,
        damage: 54,
        splash: 1.6,
        siege: 2.5,
        suicide: true,
        cooldown: 1,
      }),
      unit({
        id: 'ritter',
        name: 'Ritter',
        sight: 5,
        art: 'teuton_ritter',
        sheet: 'teuton_ritter',
        tier: 3,
        needs: 'stables',
        cost: price(80, 100),
        hp: 1400,
        speed: 3.6,
        damage: 24,
        cooldown: 0.63,
      }),
      unit({
        id: 'ram',
        name: 'Field Catapult',
        sight: 9,
        sheet: 'catapult',
        kind: 'engine',
        tier: 3,
        needs: 'workshop',
        cost: price(60, 50),
        hp: 525,
        speed: 2.8,
        damage: 60,
        range: 8,
        splash: 1.2,
        siege: 2,
        cooldown: 2,
      }),
      unit({
        id: 'falcon',
        name: 'Falcon',
        sight: 8,
        sheet: 'bird_white',
        kind: 'bat',
        tier: 2,
        needs: 'falconry',
        cost: price(60, 50),
        hp: 420,
        speed: 4.4,
        damage: 14,
        cooldown: 1,
        air: true,
        hitsAir: true,
      }),
      unit({
        id: 'griffin',
        name: 'Griffin',
        sight: 7,
        sheet: 'gryphon_gray_feathers',
        kind: 'gryphon',
        tier: 3,
        needs: 'griffinroost',
        cost: price(100, 63),
        hp: 700,
        speed: 3.9,
        damage: 29,
        splash: 0.6,
        cooldown: 1.5,
        air: true,
        hitsAir: true,
        look: { scale: 0.85 },
      }),
    ],
    towers: [
      tower({
        id: 'mill',
        name: 'Carpenter',
        sight: 4,
        art: 'germanic_carpenters_shop',
        tier: 1,
        cost: price(40, 9),
        limit: 3,
        hp: 180,
        econ: { wood: MILL_WOOD },
        reach: 0,
      }),
      tower({
        id: 'quarry',
        name: 'Masons Shop',
        sight: 4,
        art: 'teuton_masons_shop',
        tier: 1,
        cost: price(32, 18),
        limit: 3,
        hp: 180,
        econ: { stone: QUARRY_STONE },
        reach: 0,
      }),
      tower({
        id: 'barracks',
        name: 'Barracks',
        sight: 4,
        art: 'teuton_town_hall',
        tier: 1,
        cost: price(53, 27),
        limit: PRODUCER_LIMIT,
        hp: 300,
        trains: ['archer', 'saxon'],
        reach: 0,
      }),
      tower({
        id: 'stables',
        name: 'Stables',
        sight: 4,
        art: 'teuton_stables',
        tier: 2,
        cost: price(58, 36),
        limit: PRODUCER_LIMIT,
        hp: 300,
        trains: ['ritter'],
        reach: 0,
      }),
      tower({
        id: 'workshop',
        name: 'Siege Workshop',
        sight: 4,
        art: 'germanic_town_hall',
        tier: 2,
        cost: price(68, 53),
        limit: PRODUCER_LIMIT,
        hp: 320,
        trains: ['sapper', 'ram'],
        reach: 0,
      }),
      tower({
        id: 'falconry',
        name: 'Falconry',
        sight: 4,
        art: 'teuton_farm',
        tier: 2,
        cost: price(50, 36),
        limit: PRODUCER_LIMIT,
        hp: 240,
        trains: ['falcon'],
        reach: 0,
      }),
      tower({
        id: 'griffinroost',
        name: 'Griffin Roost',
        sight: 4,
        art: 'germanic_sheep_ranch',
        tier: 3,
        needs: 'falconry',
        cost: price(76, 71),
        limit: PRODUCER_LIMIT,
        hp: 340,
        trains: ['griffin'],
        reach: 0,
      }),
      tower({
        id: 'armoury',
        name: 'Armoury',
        sight: 4,
        art: 'teuton_market',
        tier: 1,
        cost: price(50, 36),
        limit: 1,
        hp: 300,
        reach: 0,
      }),
      tower({
        id: 'watch',
        name: 'Watch Tower',
        sight: 5,
        art: 'teuton_watch_tower',
        tier: 1,
        cost: price(25, 20),
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
        cost: price(45, 45),
        hp: 340,
        range: 4.5,
        damage: 14,
        cooldown: 1,
        reach: 2,
      }),
      tower({
        id: 'skybow',
        name: 'Skybow',
        sight: 6.5,
        art: 'teuton_watch_tower',
        tier: 2,
        cost: price(32, 40),
        hp: 260,
        range: 5,
        damage: 20,
        cooldown: 0.8,
        hits: 'air',
        reach: 2,
      }),
      tower({
        id: 'fort',
        name: 'Fort',
        sight: 4.5,
        art: 'teuton_fort',
        tier: 2,
        cost: price(53, 45),
        hp: 650,
        range: 2.5,
        bunker: { slots: 4, rangeBonus: 1 },
        reach: 2,
      }),
      tower({
        id: 'catapult',
        name: 'Catapult',
        sight: 7.5,
        art: 'teuton_catapult_tower',
        tier: 2,
        cost: price(58, 58),
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
        cost: price(22, 19),
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
        cost: price(62, 71),
        hp: 400,
        aura: { kind: 'heal', radius: 4, amount: 5 },
        reach: 2,
      }),
    ],
    upgrades: [
      {
        id: 'gdmg',
        name: 'Forged Blades',
        applies: 'ground',
        stat: 'damage',
        perLevel: 0.15,
        needs: 'armoury',
        levels: levels(price(45, 30)),
      },
      {
        id: 'ghp',
        name: 'Chain Mail',
        applies: 'ground',
        stat: 'hp',
        perLevel: 0.15,
        needs: 'armoury',
        levels: levels(price(45, 30)),
      },
      {
        id: 'admg',
        name: 'Hardened Beaks',
        applies: 'air',
        stat: 'damage',
        perLevel: 0.15,
        needs: 'falconry',
        levels: levels(price(35, 50)),
      },
      {
        id: 'ahp',
        name: 'Feathered Mail',
        applies: 'air',
        stat: 'hp',
        perLevel: 0.15,
        needs: 'falconry',
        levels: levels(price(35, 50)),
      },
    ],
  },
};

/** How much longer every distance (tower and castle ranges, reaches, sight, aura and detection radii) and every unit's speed is than in the tables above. The maps are `GROW` (road.ts) times their drawn size; this keeps a tower's reach in step, a bit under it so there is room to build between. */
export const REACH_SCALE = 1.5;
/** Fog is never drawn nearer than this many cells past the longest shot of anything: a tower's, a loaded bunker's or the castle's. */
const FOG_MARGIN = 1;
const CASTLE_BODY = 1.2; // sim.ts's CASTLE_RADIUS, which a castle's shot reaches past

/** How slow the game runs, against the tables as written: income (the castle's and every mill's and quarry's) is this fraction of it... */
const PACE = 0.4;
/** ...and the castle upgrades cost this many times the written price (level 2, level 3): level 3 is the written 150 against level 2's 70, so level 2's must stay under 2.1x level 3's or it costs less than level 2. */
const UPGRADE_PRICE = [4, 4];
/** Units' hit points grew about this much when their numbers came from StarCraft (`tools/towercraftScale.ts`); buildings keep up: what a tower or the castle deals and what the buildings take (the lab sets these). */
const DEFENCE_DAMAGE = 1.8;
const BUILDING_HP = 1.5;
const CASTLE_HP = BUILDING_HP;
const money = (c: Cost, k: number): Cost => ({ wood: Math.round(c.wood * k), stone: Math.round(c.stone * k) });
/** A balance lever per race (all income, the castle's and the mills' and quarries'): 1 for every race, as in StarCraft, where the races earn alike. */
const INCOME_BALANCE: Record<RaceId, number> = { swarm: 1, titan: 1, legion: 1 };
const earn = (c: Cost, race: RaceId): Cost => ({
  wood: c.wood * INCOME_BALANCE[race],
  stone: c.stone * INCOME_BALANCE[race],
});
const stretch = (cells: number) => cells * REACH_SCALE;

const scaled = (drawn: Record<RaceId, Race>): Record<RaceId, Race> => {
  const races = Object.values(drawn);
  const units = (r: Race) => r.units.map((u) => ({ ...u, speed: stretch(u.speed) })); // a unit's own range is NOT stretched: the lab showed Dwarves 68% / Goblins 30% when it was
  // The longest shot anything makes (a bunker's soldier shoots from it with the bunker's bonus), so nothing can shoot what fog hides.
  const longest = Math.max(
    ...races.flatMap((r) => {
      const garrison = Math.max(
        ...units(r)
          .filter((u) => u.garrison)
          .map((u) => u.range),
      );
      return [
        stretch(r.castle.range) + CASTLE_BODY,
        ...r.towers.map((t) => stretch(t.range) + (t.bunker ? stretch(t.bunker.rangeBonus) + garrison : 0)),
      ];
    }),
  );
  const fog = (sight: number) => Math.max(stretch(sight), longest + FOG_MARGIN);
  const out = {} as Record<RaceId, Race>;
  for (const race of races)
    out[race.id] = {
      ...race,
      castle: {
        ...race.castle,
        reach: race.castle.reach.map(stretch),
        hp: Math.round(race.castle.hp * CASTLE_HP),
        hpPerLevel: Math.round(race.castle.hpPerLevel * CASTLE_HP),
        damage: race.castle.damage * DEFENCE_DAMAGE,
        income: race.castle.income.map((c) => earn(money(c, PACE), race.id)),
        upgrades: race.castle.upgrades.map((c, i) => money(c, UPGRADE_PRICE[i] ?? 1)),
        range: stretch(race.castle.range),
        detect: stretch(race.castle.detect),
        sight: fog(race.castle.sight),
      },
      units: units(race).map((u) => ({ ...u, sight: fog(u.sight) })),
      towers: race.towers.map((t) => ({
        ...t,
        hp: Math.round(t.hp * BUILDING_HP),
        damage: t.damage * DEFENCE_DAMAGE,
        ...(t.dot ? { dot: { ...t.dot, dps: t.dot.dps * DEFENCE_DAMAGE } } : {}),
        range: stretch(t.range),
        reach: stretch(t.reach),
        sight: fog(t.sight),
        ...(t.detect === undefined ? {} : { detect: stretch(t.detect) }),
        ...(t.econ ? { econ: earn(money({ wood: 0, stone: 0, ...t.econ }, PACE), race.id) } : {}),
        ...(t.aura
          ? {
              aura: {
                ...t.aura,
                radius: stretch(t.aura.radius),
                amount: t.aura.kind === 'heal' ? t.aura.amount * DEFENCE_DAMAGE : t.aura.amount,
              },
            }
          : {}),
        ...(t.bunker ? { bunker: { ...t.bunker, rangeBonus: stretch(t.bunker.rangeBonus) } } : {}),
      })),
    };
  return out;
};

export const RACES: Record<RaceId, Race> = scaled(DRAWN_RACES);

/** The least anything sees (cells): just past the longest shot there is, so a tower can never fire from fog at what stands in its sight. */
export const FOG_EDGE = Math.min(
  ...Object.values(RACES).flatMap((r) => [
    r.castle.sight,
    ...r.towers.map((t) => t.sight),
    ...r.units.map((u) => u.sight),
  ]),
);

export const RACE_IDS = Object.keys(RACES) as RaceId[];
