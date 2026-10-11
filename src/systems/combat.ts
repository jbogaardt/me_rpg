// Stats, gear and the damage/XP rules shared by the hero and mobs.

import type { Outfit } from '../sprites/doll';
import { ITEMS } from './items';

export interface Stats {
  level: number;
  xp: number; // progress toward the next level
  hp: number; // fractional while regenerating; show Math.ceil
  maxHp: number;
  mp: number; // fractional while regenerating; show Math.floor
  maxMp: number;
  attack: number;
  defense: number;
  magic: number;
}

/** Where gear is worn. `offhand` takes a shield or a second (light) weapon; `cape` is the cloak over the shoulders. */
export const GEAR_SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet', 'cape'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

/** A weapon that shoots instead of swinging: the action key looses a projectile along the way the hero is heading. */
export interface Ranged {
  /** Arrow speed, pixels per second (the hero walks at 120). */
  speed: number;
  /** How far an arrow flies before it drops, in pixels. */
  range: number;
  /** Seconds between shots. */
  cooldown: number;
}

export interface Item {
  name: string;
  /** Gold a shop asks for it (and, at a fraction, pays for it). */
  value?: number;
  slot?: GearSlot;
  attack?: number;
  defense?: number;
  /** Set on bows: the weapon shoots (see `Ranged`) instead of swinging. */
  ranged?: Ranged;
  /** Set on supplies (no slot): drinking one restores this much HP and MP, from the pack. */
  use?: { hp: number; mp?: number };
  /** Sprite parts this item puts on the hero (see sprites/parts.ts); drawn over the hero's base look. */
  look?: Outfit;
}

export interface Spell {
  name: string;
  cost: number; // MP
  power: number; // added to the caster's magic stat
}

export interface Hero extends Partial<Record<Exclude<GearSlot, 'weapon'>, Item>> {
  name: string;
  stats: Stats;
  weapon: Item; // always armed; every other gear slot may be empty
  spell: Spell;
  gold: number; // money: dropped by enemies, spent in shops
  bag: Item[]; // the pack: everything owned but not worn (see systems/inventory.ts)
}

export interface MobKind {
  name: string;
  look: Outfit; // sprite parts (ids from sprites/parts.ts); the AI and stats are shared by every kind
  maxHp: number;
  attack: number;
  defense: number;
  xp: number; // awarded on kill
  gold: number; // dropped on kill, give or take 30% (see `rollGold`)
  speed: number; // pixels per second while chasing
  sight: number; // pixels: starts chasing inside this range
  /** Seconds of telegraph before the blow (or shot) lands. Default 0.45. */
  windup?: number;
  /** Seconds the mob is busy after attacking before it chases again. Default 0.7. */
  recover?: number;
  /** Seconds a hit stuns it (it cannot act, so a short one lets it fight back between swings). Default 0.3. */
  stagger?: number;
  /** A ranged attacker: stops `range` px from the hero, telegraphs, then fires a projectile instead of swinging. */
  shot?: MobShot;
}

export interface MobShot {
  range: number; // pixels: starts a shot from this close (must not exceed `sight`, or it never gets to fire)
  speed: number; // pixels per second; the hero walks at 120, so keep it dodgeable
  color: number; // 0xRRGGBB glow of the projectile, so each kind's shot reads differently
}

const DEFAULT_TIMINGS = { windup: 0.45, recover: 0.7, stagger: 0.3 };

/** How long a kind telegraphs, rests after an attack, and is stunned by a hit (seconds). */
export function mobTimings(kind: MobKind): { windup: number; recover: number; stagger: number } {
  return {
    windup: kind.windup ?? DEFAULT_TIMINGS.windup,
    recover: kind.recover ?? DEFAULT_TIMINGS.recover,
    stagger: kind.stagger ?? DEFAULT_TIMINGS.stagger,
  };
}

export function newHero(): Hero {
  return {
    name: 'Hero',
    stats: { level: 1, xp: 0, hp: 30, maxHp: 30, mp: 20, maxMp: 20, attack: 5, defense: 1, magic: 8 },
    weapon: ITEMS.rustySword,
    cape: ITEMS.travelerCloak,
    spell: { name: 'Time Bolt', cost: 5, power: 6 },
    gold: 0,
    bag: [],
  };
}

// Mob kinds. `look` is a paper-doll outfit (part ids from sprites/parts.ts); the numbers are tuned against the
// starter hero (about 7 damage per swing, 30 HP). Add a kind with the add-mob-kind skill.

/** The original test enemy, now a caster: hangs back and hurls slow violet bolts you can sidestep. Level 1. */
export const SHADE: MobKind = {
  name: 'Shade',
  look: { body: 'body.shade', head: 'head.shade', weapon: 'weapon.dagger' },
  maxHp: 24,
  attack: 6,
  defense: 0,
  xp: 12,
  gold: 7,
  speed: 60,
  sight: 6 * 32,
  windup: 0.65,
  recover: 1.3,
  shot: { range: 5.5 * 32, speed: 135, color: 0xb06cff },
};

/** Desert enemy: tougher than the shade, tuned for roughly levels 2-4. */
export const RAIDER: MobKind = {
  name: 'Dune Raider',
  look: {
    body: 'body.bronze',
    head: 'head.human_bronze',
    headwear: 'headwear.bandana_tan',
    torso: 'torso.leather',
    legs: 'legs.pants_tan',
    feet: 'feet.boots_brown',
    weapon: 'weapon.arming_bronze',
  },
  maxHp: 40,
  attack: 9,
  defense: 1,
  xp: 22,
  gold: 14,
  speed: 70,
  sight: 5.5 * 32,
  windup: 0.38,
  recover: 0.5,
  stagger: 0.2,
};

/** Frost enemy: an armoured, icy skeleton; the hardest so far, tuned for roughly levels 4-6. */
export const FROSTBOUND: MobKind = {
  name: 'Frostbound',
  look: {
    body: 'body.frost',
    head: 'head.frost',
    torso: 'torso.plate_steel',
    legs: 'legs.plate_steel',
    headwear: 'headwear.nasal',
    weapon: 'weapon.arming_steel',
  },
  maxHp: 64,
  attack: 13,
  defense: 2,
  xp: 38,
  gold: 24,
  speed: 62,
  sight: 6 * 32,
  windup: 0.4,
  recover: 0.6,
  stagger: 0.1, // armoured: a hit barely interrupts it
};

/** Level 1 fodder: fragile and quick, hits lightly. */
export const GOBLIN: MobKind = {
  name: 'Goblin',
  look: {
    body: 'body.green',
    head: 'head.goblin',
    torso: 'torso.tunic_brown',
    legs: 'legs.pants_charcoal',
    feet: 'feet.boots_brown',
    weapon: 'weapon.dagger',
  },
  maxHp: 14,
  attack: 4,
  defense: 0,
  xp: 6,
  gold: 4,
  speed: 82,
  sight: 5 * 32,
  windup: 0.3,
  recover: 0.45,
  stagger: 0.18,
};

/** A fast hunter with no gear, spotting the hero from far away. */
export const WOLFKIN: MobKind = {
  name: 'Wolfkin',
  look: { body: 'body.fur_grey', head: 'head.wolf', legs: 'legs.pants_brown' },
  maxHp: 22,
  attack: 7,
  defense: 0,
  xp: 12,
  gold: 7,
  speed: 96,
  sight: 6 * 32,
  windup: 0.28,
  recover: 0.4,
  stagger: 0.12,
};

/** Undead archer: keeps its distance and flicks bone shards, slowly but hard. */
export const SKELETON: MobKind = {
  name: 'Skeleton',
  look: { body: 'body.skeleton', head: 'head.skeleton', weapon: 'weapon.arming_iron', shield: 'shield.round_brown' },
  maxHp: 32,
  attack: 8,
  defense: 1,
  xp: 16,
  gold: 10,
  speed: 52,
  sight: 6.5 * 32,
  windup: 0.55,
  recover: 1,
  shot: { range: 6 * 32, speed: 175, color: 0xe9e2c8 },
};

/** Shambling and tanky for its level, but very slow. */
export const ZOMBIE: MobKind = {
  name: 'Zombie',
  look: { body: 'body.zombie', head: 'head.zombie', torso: 'torso.tunic_charcoal', legs: 'legs.pants_brown' },
  maxHp: 40,
  attack: 7,
  defense: 0,
  xp: 14,
  gold: 9,
  speed: 36,
  sight: 4 * 32,
};

/** A heavy hitter in a barbarian helm: a real fight at levels 3-5. */
export const ORC: MobKind = {
  name: 'Orc',
  look: {
    body: 'body.dark_green',
    head: 'head.orc_dark',
    headwear: 'headwear.barbarian',
    torso: 'torso.leather',
    legs: 'legs.pants_charcoal',
    feet: 'feet.boots_black',
    weapon: 'weapon.arming_iron',
  },
  maxHp: 56,
  attack: 11,
  defense: 1,
  xp: 30,
  gold: 18,
  speed: 58,
  sight: 5.5 * 32,
  windup: 0.4,
  recover: 0.55,
  stagger: 0.08,
};

/** The toughest so far: huge HP and defense, slow, hits very hard with bare fists. */
export const TROLL: MobKind = {
  name: 'Troll',
  look: { body: 'body.green', head: 'head.troll', legs: 'legs.pants_brown' },
  maxHp: 96,
  attack: 15,
  defense: 3,
  xp: 60,
  gold: 40,
  speed: 46,
  sight: 5 * 32,
  windup: 0.5,
  recover: 0.8,
  stagger: 0.04, // too big to be stunned: it just keeps swinging
};

/** What a mob is doing, in the order used on the wire (src/net/protocol.ts). */
export const MOB_STATES = ['idle', 'wander', 'chase', 'windup', 'recover', 'dead'] as const;
export type MobState = (typeof MOB_STATES)[number];

/** Mob kinds a map can spawn, by the `kind` used in MapData.mobs. */
export const MOB_KINDS: Record<string, MobKind> = {
  shade: SHADE,
  raider: RAIDER,
  frostbound: FROSTBOUND,
  goblin: GOBLIN,
  wolfkin: WOLFKIN,
  skeleton: SKELETON,
  zombie: ZOMBIE,
  orc: ORC,
  troll: TROLL,
};

/** The gear a hero is wearing, in slot order. */
export const wornGear = (h: Hero): Item[] => GEAR_SLOTS.flatMap((slot) => h[slot] ?? []);
/** Attack from the weapon and anything held in the off-hand (a second blade adds its edge). */
export const gearAttack = (h: Hero) => wornGear(h).reduce((sum, i) => sum + (i.attack ?? 0), 0);
/** Defense from every piece of armor and a shield. */
export const gearDefense = (h: Hero) => wornGear(h).reduce((sum, i) => sum + (i.defense ?? 0), 0);
export const attackPower = (h: Hero) => h.stats.attack + gearAttack(h);
export const defensePower = (h: Hero) => h.stats.defense + gearDefense(h);
export const spellPower = (h: Hero) => h.stats.magic + h.spell.power;
/** XP to go from `level` to the next. Grows faster than linearly: 20 at level 1, 224 at 5, 632 at 10. */
export const xpToNext = (level: number) => Math.round(20 * level ** 1.5);

/** Stat gains for reaching `level`. They step up every four levels so power keeps pace with the XP curve. */
export function levelGains(level: number) {
  const tier = Math.floor(level / 4);
  return {
    maxHp: 6 + 2 * tier,
    maxMp: 4 + tier,
    attack: 2 + tier,
    defense: 1 + Math.floor(tier / 2),
    magic: 2 + tier,
  };
}

/** The gold an enemy drops this time: its usual amount, give or take 30%, and at least 1. */
export const rollGold = (kind: MobKind): number => Math.max(1, Math.round(kind.gold * (0.7 + Math.random() * 0.6)));

/** One hit: power with ±15% spread, minus defense, never below 1. */
export function rollDamage(power: number, defense: number): number {
  return Math.max(1, Math.round(power * (0.85 + Math.random() * 0.3)) - defense);
}

/** Add XP and apply any level-ups (which also fully restore HP/MP). Returns the number of levels gained. */
export function gainXp(s: Stats, amount: number): number {
  s.xp += amount;
  let levels = 0;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    const gains = levelGains(s.level);
    s.maxHp += gains.maxHp;
    s.maxMp += gains.maxMp;
    s.attack += gains.attack;
    s.defense += gains.defense;
    s.magic += gains.magic;
    levels++;
  }
  if (levels) {
    s.hp = s.maxHp;
    s.mp = s.maxMp;
  }
  return levels;
}
