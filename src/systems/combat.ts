// Stats, gear and the damage/XP rules shared by the hero and mobs.

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
  attack?: number;
  defense?: number;
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
  sheet: string; // file under public/sprites/
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
    weapon: { name: 'Wooden Sword', attack: 2 },
    armor: { name: "Traveler's Cloak", defense: 1 },
    spell: { name: 'Time Bolt', cost: 5, power: 6 },
  };
}

/** Temporary test enemy (placeholder ninja sheet). */
export const SHADE: MobKind = {
  name: 'Shade',
  sheet: 'ninja_m.png',
  maxHp: 24,
  attack: 6,
  defense: 0,
  xp: 12,
  speed: 60,
  sight: 5 * 32,
};

/** Mob kinds a map can spawn, by the `kind` used in MapData.mobs. */
export const MOB_KINDS: Record<string, MobKind> = { shade: SHADE };

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
