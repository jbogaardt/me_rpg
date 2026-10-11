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

export interface Item {
  name: string;
  slot?: 'weapon' | 'armor';
  attack?: number;
  defense?: number;
  /** Sprite parts this item puts on the hero (see sprites/parts.ts); drawn over the hero's base look. */
  look?: Outfit;
}

export interface Spell {
  name: string;
  cost: number; // MP
  power: number; // added to the caster's magic stat
}

export interface Hero {
  name: string;
  stats: Stats;
  weapon: Item;
  armor: Item;
  spell: Spell;
}

export interface MobKind {
  name: string;
  look: Outfit; // sprite parts (ids from sprites/parts.ts); the AI and stats are shared by every kind
  maxHp: number;
  attack: number;
  defense: number;
  xp: number; // awarded on kill
  speed: number; // pixels per second while chasing
  sight: number; // pixels: starts chasing inside this range
}

export function newHero(): Hero {
  return {
    name: 'Hero',
    stats: { level: 1, xp: 0, hp: 30, maxHp: 30, mp: 20, maxMp: 20, attack: 5, defense: 1, magic: 8 },
    weapon: ITEMS.rustySword,
    armor: ITEMS.travelerCloak,
    spell: { name: 'Time Bolt', cost: 5, power: 6 },
  };
}

// Mob kinds. `look` is a paper-doll outfit (part ids from sprites/parts.ts); the numbers are tuned against the
// starter hero (about 7 damage per swing, 30 HP). Add a kind with the add-mob-kind skill.

/** The original test enemy, now a charcoal skeleton. Easy: fine for level 1. */
export const SHADE: MobKind = {
  name: 'Shade',
  look: { body: 'body.shade', head: 'head.shade', weapon: 'weapon.dagger' },
  maxHp: 24,
  attack: 6,
  defense: 0,
  xp: 12,
  speed: 60,
  sight: 5 * 32,
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
  speed: 70,
  sight: 5.5 * 32,
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
  speed: 62,
  sight: 6 * 32,
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
  speed: 82,
  sight: 5 * 32,
};

/** A fast hunter with no gear, spotting the hero from far away. */
export const WOLFKIN: MobKind = {
  name: 'Wolfkin',
  look: { body: 'body.fur_grey', head: 'head.wolf', legs: 'legs.pants_brown' },
  maxHp: 22,
  attack: 7,
  defense: 0,
  xp: 12,
  speed: 96,
  sight: 6 * 32,
};

/** Undead soldier: slowish, a little armoured, hits for more than its HP suggests. */
export const SKELETON: MobKind = {
  name: 'Skeleton',
  look: { body: 'body.skeleton', head: 'head.skeleton', weapon: 'weapon.arming_iron', shield: 'shield.round_brown' },
  maxHp: 32,
  attack: 8,
  defense: 1,
  xp: 16,
  speed: 52,
  sight: 5 * 32,
};

/** Shambling and tanky for its level, but very slow. */
export const ZOMBIE: MobKind = {
  name: 'Zombie',
  look: { body: 'body.zombie', head: 'head.zombie', torso: 'torso.tunic_charcoal', legs: 'legs.pants_brown' },
  maxHp: 40,
  attack: 7,
  defense: 0,
  xp: 14,
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
  speed: 58,
  sight: 5.5 * 32,
};

/** The toughest so far: huge HP and defense, slow, hits very hard with bare fists. */
export const TROLL: MobKind = {
  name: 'Troll',
  look: { body: 'body.green', head: 'head.troll', legs: 'legs.pants_brown' },
  maxHp: 96,
  attack: 15,
  defense: 3,
  xp: 60,
  speed: 46,
  sight: 5 * 32,
};

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

export const attackPower = (h: Hero) => h.stats.attack + (h.weapon.attack ?? 0);
export const defensePower = (h: Hero) => h.stats.defense + (h.armor.defense ?? 0);
export const spellPower = (h: Hero) => h.stats.magic + h.spell.power;
export const xpToNext = (level: number) => 20 * level;

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
    s.maxHp += 6;
    s.maxMp += 4;
    s.attack += 2;
    s.defense += 1;
    s.magic += 2;
    levels++;
  }
  if (levels) {
    s.hp = s.maxHp;
    s.mp = s.maxMp;
  }
  return levels;
}
