// Stats, gear and the damage/XP rules shared by the hero and mobs.

import type { Direction } from '../core/direction';
import type { Outfit } from '../sprites/doll';
import { ITEMS } from './items';
import { newNeeds, type Needs } from './needs';
import type { Focus } from './spells';
import type { SkillId } from './skills';

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

/**
 * Where gear is worn. `offhand` takes a shield or a second (one-handed) weapon; `cape` is the cloak over the shoulders;
 * `tool` is the one gadget in hand; `bag` is the sack or pack on the hero's back (it adds pack slots, see inventory.ts);
 * `charm` is a talisman on a cord round the neck (no art on the doll; only quests hand them out).
 */
export const GEAR_SLOTS = [
  'weapon',
  'offhand',
  'head',
  'chest',
  'legs',
  'feet',
  'cape',
  'tool',
  'bag',
  'charm',
] as const;
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
  // Buffs beyond attack and defense. Quest rewards carry them (shops sell none); they add up over everything worn.
  /** Walking speed, percent faster (8 = 8% quicker). */
  speed?: number;
  /** Added to the hero's magic stat, so Time Bolts hit harder. */
  magic?: number;
  /** HP regained per second (on top of the usual slow regeneration). */
  regen?: number;
  /** MP regained per second (on top of the usual regeneration). */
  mpRegen?: number;
  /** Percent more XP from kills. */
  xpBonus?: number;
  /** Percent more gold from kills. */
  goldBonus?: number;
  /** A one-of-a-kind reward: shown in the quest colour and never sold in a shop. */
  rare?: boolean;
  /** Set on bows: the weapon shoots (see `Ranged`) instead of swinging. */
  ranged?: Ranged;
  /** Set on wands and tomes (weapons): the plain attack is a free bolt, and a combo of directions casts a spell. */
  focus?: Focus;
  /** Set on supplies (no slot): drinking one restores this much HP, MP, food and water, from the pack. */
  use?: { hp: number; mp?: number; food?: number; water?: number };
  /** Set on bags (slot `bag`): extra pack slots while it is worn. */
  capacity?: number;
  /** Sprite parts this item puts on the hero (see sprites/parts.ts); drawn over the hero's base look. */
  look?: Outfit;
}

export interface Hero extends Partial<Record<Exclude<GearSlot, 'weapon'>, Item>> {
  name: string;
  stats: Stats;
  weapon: Item; // always armed; every other gear slot may be empty
  /** Carried items that are not worn (see inventory.ts for the size limit). */
  pack: Item[];
  gold: number; // money: dropped by enemies, spent in shops
  /** Where the hero is in the story quests (systems/quests.ts). */
  quests: QuestLog;
  /** Spells learned from the training wizard (systems/skills.ts): carried in the hero, so any weapon can use them. */
  skills: SkillId[];
  /** The skills ready to cast (at most two of those learned; a wand's combos do not count). */
  loadout: SkillId[];
  /** Hunger and thirst (systems/needs.ts). */
  needs: Needs;
}

/** A hero's place in the quest chain (systems/quests.ts has the chain itself and the rules). */
export interface QuestLog {
  /** Quests handed in so far: the index of the current one. */
  stage: number;
  /** Has the current quest been given to the hero? */
  taken: boolean;
  /** Kills so far (kill quests), or a bit per site gathered (gather quests). */
  progress: number;
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
  /**
   * A caster with a melee fallback: from `ray.range` away it telegraphs and fires an instant beam along the line it
   * locked on at the start of the windup (sidestep it), but a hero within melee reach is simply swung at.
   */
  ray?: MobRay;
}

export interface MobRay {
  range: number; // pixels: starts a ray from this close (must not exceed `sight`, nor RAY_LENGTH)
  color: number; // 0xRRGGBB of the beam
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
    pack: [],
    gold: 0,
    quests: { stage: 0, taken: false, progress: 0 },
    skills: [],
    loadout: [],
    needs: newNeeds(),
  };
}

// Mob kinds. `look` is a paper-doll outfit (part ids from sprites/parts.ts). Each kind is tuned for a band of hero levels,
// and the biomes hand them out by that band (greenwood 1-3, eastwood and the coast 3-5, the barrows and desert 4-6, the
// frostlands 5-8, the Mirewater 6-8, the jungle 7-9, the marsh 8-10): a blow should take roughly 10-20% of a hero's
// HP at the middle of the band, wearing the usual gear for it. Add a kind with the add-mob-kind skill.

/** The original test enemy, now a caster: hangs back and hurls slow violet bolts you can sidestep. Level 1. */
export const SHADE: MobKind = {
  name: 'Shade',
  look: { body: 'body.shade', head: 'head.shade', weapon: 'weapon.dagger' },
  maxHp: 28,
  attack: 9,
  defense: 0,
  xp: 13,
  gold: 7,
  speed: 60,
  sight: 6 * 32,
  windup: 0.65,
  recover: 1.3,
  shot: { range: 5.5 * 32, speed: 135, color: 0xb06cff },
};

/** Desert and coast enemy: tougher than the shade, tuned for roughly levels 4-5. */
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
  maxHp: 48,
  attack: 15,
  defense: 1,
  xp: 28,
  gold: 16,
  speed: 70,
  sight: 5.5 * 32,
  windup: 0.38,
  recover: 0.5,
  stagger: 0.2,
};

/** Desert enemy: a mummy that sears you with its sceptre from a distance and bludgeons you up close. Levels 4-6. */
export const MUMMY: MobKind = {
  name: 'Mummy',
  look: { body: 'body.mummy' },
  maxHp: 60,
  attack: 14,
  defense: 1,
  xp: 30,
  gold: 17,
  speed: 48,
  sight: 6 * 32,
  windup: 0.6,
  recover: 0.9,
  stagger: 0.15,
  ray: { range: 4.5 * 32, color: 0x59e0a8 },
};

/** Frost enemy: an armoured, icy skeleton, tuned for roughly levels 5-7. */
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
  maxHp: 80,
  attack: 22,
  defense: 3,
  xp: 55,
  gold: 32,
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
  maxHp: 18,
  attack: 7,
  defense: 0,
  xp: 7,
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
  maxHp: 26,
  attack: 10,
  defense: 0,
  xp: 13,
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
  maxHp: 36,
  attack: 12,
  defense: 1,
  xp: 22,
  gold: 12,
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
  maxHp: 52,
  attack: 13,
  defense: 0,
  xp: 24,
  gold: 14,
  speed: 36,
  sight: 4 * 32,
};

/** A heavy hitter in a barbarian helm: a real fight at levels 5-6. */
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
  maxHp: 70,
  attack: 20,
  defense: 2,
  xp: 40,
  gold: 22,
  speed: 58,
  sight: 5.5 * 32,
  windup: 0.4,
  recover: 0.55,
  stagger: 0.08,
};

/** The toughest of the open world's old kinds: huge HP and defense, slow, hits very hard with bare fists. Levels 6-8. */
export const TROLL: MobKind = {
  name: 'Troll',
  look: { body: 'body.green', head: 'head.troll', legs: 'legs.pants_brown' },
  maxHp: 130,
  attack: 26,
  defense: 4,
  xp: 90,
  gold: 50,
  speed: 46,
  sight: 5 * 32,
  windup: 0.5,
  recover: 0.8,
  stagger: 0.04, // too big to be stunned: it just keeps swinging
};

/**
 * Training-ground enemies for the second trial (systems/skills.ts, `spiritMark`), tuned for a level 15 hero (about 160 HP,
 * 24 defense, 60 attack): they hit hard enough to matter at that level, which nothing in the open world does.
 */
export const WARLORD: MobKind = {
  name: 'Warlord',
  look: {
    body: 'body.dark_green',
    head: 'head.orc_dark',
    headwear: 'headwear.greathelm',
    torso: 'torso.plate_steel',
    legs: 'legs.plate_steel',
    feet: 'feet.boots_black',
    weapon: 'weapon.arming_steel',
  },
  maxHp: 320,
  attack: 46,
  defense: 6,
  xp: 180,
  gold: 90,
  speed: 58,
  sight: 6 * 32,
  windup: 0.5,
  recover: 0.6,
  stagger: 0.05,
};

/** A hooded caster for the second trial: slow blue bolts that hurt a level 15 hero. */
export const WRAITH: MobKind = {
  name: 'Wraith',
  look: { body: 'body.shade', head: 'head.shade', headwear: 'headwear.hood_brown', weapon: 'weapon.dagger' },
  maxHp: 180,
  attack: 50,
  defense: 4,
  xp: 150,
  gold: 75,
  speed: 54,
  sight: 7 * 32,
  windup: 0.65,
  recover: 1.2,
  shot: { range: 6 * 32, speed: 150, color: 0x7aa8ff },
};

/**
 * Training-ground enemies for the level 10 trial (systems/skills.ts), tuned for a hero of that level (about 100 HP, 14
 * defense, 35 attack): between the open world's toughest and the level 15 trial's warlords.
 */
export const CHIEFTAIN: MobKind = {
  name: 'Orc Chieftain',
  look: {
    body: 'body.dark_green',
    head: 'head.orc_dark',
    headwear: 'headwear.legion',
    torso: 'torso.legion_iron',
    legs: 'legs.pants_charcoal',
    feet: 'feet.boots_black',
    weapon: 'weapon.arming_steel',
  },
  maxHp: 170,
  attack: 32,
  defense: 4,
  xp: 100,
  gold: 55,
  speed: 56,
  sight: 6 * 32,
  windup: 0.5,
  recover: 0.6,
  stagger: 0.06,
};

/** A hooded ranged fighter for the level 10 trial. */
export const CULTIST: MobKind = {
  name: 'Cultist',
  look: { body: 'body.shade', head: 'head.shade', headwear: 'headwear.bandana_tan', weapon: 'weapon.dagger' },
  maxHp: 100,
  attack: 34,
  defense: 2,
  xp: 90,
  gold: 50,
  speed: 54,
  sight: 7 * 32,
  windup: 0.65,
  recover: 1.2,
  shot: { range: 6 * 32, speed: 145, color: 0xff9a5a },
};

/** The Mirewater's marsh witch: stays back in the reeds and flings murky bolts. Levels 6-8. */
export const HEXER: MobKind = {
  name: 'Hexer',
  look: {
    body: 'body.shade',
    head: 'head.shade',
    headwear: 'headwear.wizard_navy',
    torso: 'torso.robe_blue',
    weapon: 'weapon.dagger',
  },
  maxHp: 60,
  attack: 24,
  defense: 2,
  xp: 62,
  gold: 34,
  speed: 54,
  sight: 7 * 32,
  windup: 0.6,
  recover: 1.1,
  shot: { range: 6 * 32, speed: 150, color: 0x6fd0a0 },
};

/** A bloated swamp corpse: slow, soaks up blows and hits hard. Levels 6-8. */
export const BOG_GHOUL: MobKind = {
  name: 'Bog Ghoul',
  look: { body: 'body.zombie', head: 'head.zombie', torso: 'torso.tunic_forest', legs: 'legs.pants_forest' },
  maxHp: 100,
  attack: 24,
  defense: 3,
  xp: 68,
  gold: 38,
  speed: 40,
  sight: 4.5 * 32,
  windup: 0.55,
  recover: 0.8,
  stagger: 0.1,
};

/** A big, fast wolf: the jungle and wild country's hunter. Levels 6-8. */
export const WARG: MobKind = {
  name: 'Warg',
  look: { body: 'body.fur_grey', head: 'head.wolf', legs: 'legs.pants_charcoal', torso: 'torso.leather' },
  maxHp: 60,
  attack: 20,
  defense: 1,
  xp: 42,
  gold: 24,
  speed: 106,
  sight: 6.5 * 32,
  windup: 0.3,
  recover: 0.45,
  stagger: 0.1,
};

/** An orc picked to guard the Tuskwood: legion plate and a shield. Levels 7-9. */
export const TUSK_GUARD: MobKind = {
  name: 'Tusk Guard',
  look: {
    body: 'body.dark_green',
    head: 'head.orc_dark',
    headwear: 'headwear.legion',
    torso: 'torso.legion_iron',
    legs: 'legs.pants_charcoal',
    feet: 'feet.boots_black',
    weapon: 'weapon.arming_steel',
    shield: 'shield.round_black',
  },
  maxHp: 130,
  attack: 28,
  defense: 5,
  xp: 85,
  gold: 46,
  speed: 56,
  sight: 5.5 * 32,
  windup: 0.45,
  recover: 0.6,
  stagger: 0.06,
};

/** The deep Frostlands' sentry: a frostbound in a great helm and a kite shield. Levels 7-9. */
export const FROST_WARDEN: MobKind = {
  name: 'Frost Warden',
  look: {
    body: 'body.frost',
    head: 'head.frost',
    torso: 'torso.plate_steel',
    legs: 'legs.plate_steel',
    feet: 'feet.plate_steel',
    headwear: 'headwear.greathelm',
    weapon: 'weapon.arming_silver',
    shield: 'shield.kite_gray',
  },
  maxHp: 150,
  attack: 30,
  defense: 6,
  xp: 100,
  gold: 56,
  speed: 58,
  sight: 6 * 32,
  windup: 0.45,
  recover: 0.6,
  stagger: 0.05,
};

/** What a mob is doing, in the order used on the wire (src/net/protocol.ts). */
export const MOB_STATES = ['idle', 'wander', 'chase', 'windup', 'recover', 'dead'] as const;
export type MobState = (typeof MOB_STATES)[number];

/** What a viewer needs to draw a mob: the host's mob as it is now. The network sends it (net/mobWire.ts); a co-op guest's copy of a mob is drawn from one. */
export interface MobView {
  x: number;
  y: number;
  facing: Direction;
  state: MobState;
  hp: number;
  /** Seconds left in the state (the windup, the recovery, or the wait to respawn); only meaningful in those states. */
  timer: number;
  moving: boolean;
}

/** Mob kinds a map can spawn, by the `kind` used in MapData.mobs. */
export const MOB_KINDS: Record<string, MobKind> = {
  shade: SHADE,
  raider: RAIDER,
  frostbound: FROSTBOUND,
  goblin: GOBLIN,
  wolfkin: WOLFKIN,
  skeleton: SKELETON,
  zombie: ZOMBIE,
  mummy: MUMMY,
  orc: ORC,
  troll: TROLL,
  chieftain: CHIEFTAIN,
  cultist: CULTIST,
  warlord: WARLORD,
  wraith: WRAITH,
  hexer: HEXER,
  bogGhoul: BOG_GHOUL,
  warg: WARG,
  tuskGuard: TUSK_GUARD,
  frostWarden: FROST_WARDEN,
};

/** The gear a hero is wearing, in slot order. */
export const wornGear = (h: Hero): Item[] => GEAR_SLOTS.flatMap((slot) => h[slot] ?? []);
/** Attack from the weapon and anything held in the off-hand (a second blade adds its edge). */
export const gearAttack = (h: Hero) => wornGear(h).reduce((sum, i) => sum + (i.attack ?? 0), 0);
/** Defense from every piece of armor and a shield. */
export const gearDefense = (h: Hero) => wornGear(h).reduce((sum, i) => sum + (i.defense ?? 0), 0);
/** A buff summed over everything worn. */
const gearSum = (h: Hero, key: 'speed' | 'magic' | 'regen' | 'mpRegen' | 'xpBonus' | 'goldBonus') =>
  wornGear(h).reduce((sum, i) => sum + (i[key] ?? 0), 0);
export const gearMagic = (h: Hero) => gearSum(h, 'magic');
/** Walking speed as a multiplier: 1 plain, 1.2 with +20% from gear. */
export const speedFactor = (h: Hero) => 1 + gearSum(h, 'speed') / 100;
/** HP and MP per second that gear adds to the usual regeneration. */
export const gearRegen = (h: Hero) => gearSum(h, 'regen');
export const gearMpRegen = (h: Hero) => gearSum(h, 'mpRegen');
/** What a kill is worth to this hero: its XP and gold, plus the bonus from gear (at least what it was). */
export const xpFor = (h: Hero, xp: number) => Math.round(xp * (1 + gearSum(h, 'xpBonus') / 100));
export const goldFor = (h: Hero, gold: number) => Math.round(gold * (1 + gearSum(h, 'goldBonus') / 100));
export const attackPower = (h: Hero) => h.stats.attack + gearAttack(h);
export const defensePower = (h: Hero) => h.stats.defense + gearDefense(h);
/** The strength behind a combo's damage and healing: the magic stat, plus what the wand or tome adds and any magic from gear (nothing otherwise). */
export const spellPower = (h: Hero) => h.stats.magic + (h.weapon.focus?.power ?? 0) + gearMagic(h);
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
