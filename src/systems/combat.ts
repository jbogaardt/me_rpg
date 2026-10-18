// Stats, gear and the damage/XP rules shared by the hero and mobs.

import type { Direction } from '../core/direction';
import type { Outfit } from '../sprites/doll';
import { startGear } from './items';
import { newNeeds, type Needs } from './needs';
import type { Focus } from './spells';
import type { SkillId } from './skills';
import type { Gem } from './gems';
import type { MobDeath } from './particleEffects';

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
  /** Crops are watered with it (a waterskin): one is used up per watering (systems/crops.ts). */
  waters?: boolean;
  /** Set on bags (slot `bag`): extra pack slots while it is worn. */
  capacity?: number;
  /** Sprite parts this item puts on the hero (see sprites/parts.ts); drawn over the hero's base look. */
  look?: Outfit;
  /** Which picture of its icon kind it is in the item sheet (systems/itemArt.ts); 0, the kind's plain one, when unset. */
  art?: number;
  /** Set on gems (no slot, kept in the pack): what setting one in a piece of gear adds (systems/gems.ts). */
  gem?: Gem;
  /** Set on an item made by setting a gem in another (systems/gems.ts): the ids of the piece and the gem it was made from. */
  fused?: { base: string; gem: string };
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
  /** How much bigger than a person it is drawn (default 1); only the picture grows, not its collision body. */
  scale?: number;
  look: Outfit; // sprite parts (ids from sprites/parts.ts); the AI and stats are shared by every kind
  maxHp: number;
  attack: number;
  defense: number;
  xp: number; // awarded on kill
  gold: number; // dropped on kill, give or take 30% (see `rollGold`)
  speed: number; // pixels per second while chasing
  sight: number; // pixels: starts chasing inside this range
  /** Seconds of telegraph before the blow (or shot) lands. Default 0.5. */
  windup?: number;
  /** Seconds the mob is busy after attacking before it chases again. Default 0.7. */
  recover?: number;
  /** Seconds a hit stuns it (it cannot act, so a short one lets it fight back between swings). Default 0.3. */
  stagger?: number;
  /** A ranged attacker: stops `range` px from the hero, telegraphs, then fires a projectile instead of swinging. */
  shot?: MobShot;
  /**
   * A caster with a melee fallback: from `ray.range` away it telegraphs, then holds a beam on the hero that burns for
   * as long as it lasts. Any hit on the caster breaks it, and it then only fights in melee for `ray.rest` seconds.
   */
  ray?: MobRay;
  /** How the windup reads (the ground marks); see `telegraphOf`. All optional. */
  telegraph?: MobTelegraph;
  /** The hero level this foe was made for when a zone re-bands it (`bands.ts`); absent: read from its body (`mobLevel`). */
  level?: number;
  /** A boss of the Dungeon Master's quest (systems/dmBoss.ts): made for the quest, not a kind of the content, and it does not respawn. */
  boss?: boolean;
  /** How it goes when it dies (`MOB_DEATHS`): crumbling bones, a splat, a wisp. Absent: the plain poof. */
  death?: MobDeath;
  /** A named boss of the content (entities.json `boss`, systems/bosses.ts): placed once, never respawns, mends when the party leaves it. */
  named?: boolean;
  /** Blows it shrugs off before one staggers it (`Poise`, systems/mobDefense.ts); absent or 0: every blow staggers. Its windup and lunge are then uninterruptible. */
  poiseMax?: number;
  /** Seconds unhurt before its poise is whole again (default `POISE_REGEN`). */
  poiseRegen?: number;
  /** Never pushed back by a blow (a brute, a giant, a named boss): hit, but it holds its ground (`Mob.hit`). */
  immovable?: boolean;
  /** A gap-closer for when it is kited: a telegraphed dash at a hero who stays out of range (`Mob.ts`). */
  charge?: MobCharge;
  /** A shield: turns frontal arrows and spells aside while it is up (`frontal`, systems/mobDefense.ts). */
  guard?: MobGuard;
}

/** A kind's gap-closer, every number in full (the content gives only what it changes, `resolveCharge`). */
export interface MobCharge {
  range: number; // px: the hero further than this (and seen) starts the count
  after: number; // seconds the hero stays out of range in the fight before it charges
  windup: number; // seconds of telegraph before the dash
  speed: number; // px/s of the dash
  duration: number; // seconds the dash lasts at most
  cooldown: number; // seconds before it may charge again
  power: number; // multiplier on its blow when the dash lands
}

/** A kind's shield, every number in full (`resolveGuard`). */
export interface MobGuard {
  arc: number; // degrees of its front that are covered
  chip: number; // 0..1, the share of a blocked blow that still hurts
}

/** Per-kind tuning of the windup cue. */
export interface MobTelegraph {
  ground?: boolean; // draw the ground marks toward the blow (default: true for every attack); the colour is one danger palette, not the kind's
}

export interface MobRay {
  range: number; // pixels: starts a ray from this close (must not exceed `sight`); it breaks if the hero gets past 1.4x this
  color: number; // 0xRRGGBB of the beam
  tick: number; // seconds between burns
  power: number; // each burn is this fraction of the kind's `attack`
  duration: number; // seconds the beam holds at most
  rest: number; // seconds after a broken (or finished) beam before it can cast another
}

export interface MobShot {
  range: number; // pixels: starts a shot from this close (must not exceed `sight`, or it never gets to fire)
  speed: number; // pixels per second; the hero walks at 120, so keep it dodgeable
  color: number; // 0xRRGGBB glow of the projectile, so each kind's shot reads differently
}

const DEFAULT_TIMINGS = { windup: 0.5, recover: 0.7, stagger: 0.3 };

/**
 * A melee blow's telegraph is this share of the kind's `windup`: with the mouse a hero aims exactly and a half-second
 * tell is a free dodge, so it is quick (a plain blow 0.33 s, spread to 0.26 s at the quickest). A shot or beam keeps its
 * authored windup: it is dodged by moving, not by aim.
 */
export const WINDUP_PACE = 0.65;
/** The shortest windup a spread blow may have: a clear tell is still a quarter second. The content check holds every kind to it. */
export const WINDUP_FLOOR = 0.25;

/** How long a kind telegraphs, rests after an attack, and is stunned by a hit (seconds). */
export function mobTimings(kind: MobKind): { windup: number; recover: number; stagger: number } {
  return {
    windup: (kind.windup ?? DEFAULT_TIMINGS.windup) * (kind.shot || kind.ray ? 1 : WINDUP_PACE),
    recover: kind.recover ?? DEFAULT_TIMINGS.recover,
    stagger: kind.stagger ?? DEFAULT_TIMINGS.stagger,
  };
}

/** A plain blow's flash when the kind names none: a hot orange (clearly not the pale hit flash). */
/** The windup cue for a kind's attack: whether the ground marks are drawn (always, unless the kind opts out). The colours are the danger palette (systems/tellLook.ts) for every kind. */
export function telegraphOf(kind: MobKind): { ground: boolean } {
  return { ground: kind.telegraph?.ground ?? true };
}

export function newHero(): Hero {
  return {
    name: 'Hero',
    stats: { level: 1, xp: 0, hp: 30, maxHp: 30, mp: 20, maxMp: 20, attack: 5, defense: 1, magic: 8 },
    ...startGear(),
    pack: [],
    gold: 0,
    quests: { stage: 0, taken: false, progress: 0 },
    skills: [],
    loadout: [],
    needs: newNeeds(),
  };
}

/** What a mob is doing, in the order used on the wire (src/net/protocol.ts). */
export const MOB_STATES = ['idle', 'wander', 'chase', 'windup', 'recover', 'dead', 'channel'] as const;
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

/**
 * Mob kinds by entity id: the `mob` entities of public/content/entities.json, installed at boot by
 * `ContentManager.install` (and by the test setup, tools/content/setup.ts). Each kind is tuned for a band of hero
 * levels, and the biomes hand them out by that band (greenwood 1-3, eastwood and the coast 3-5, the barrows and desert
 * 4-6, the frostlands 5-8, the Mirewater 6-8, the jungle 7-9, the marsh 8-10): a blow should take roughly 10-20% of a
 * hero's HP at the middle of the band, wearing the usual gear for it. Add a kind with the add-mob-kind skill.
 */
export const MOB_KINDS: Record<string, MobKind> = {};

/** The mark in the key of a kind re-banded for a zone's level ("orc@14", `bands.ts`); what is before it is the content's own key. */
export const BAND_MARK = '@';

/** Replace the mob kinds (the content's). The record keeps its identity, so modules holding it see the new kinds. */
export function setMobKinds(kinds: Record<string, MobKind>) {
  for (const key of Object.keys(MOB_KINDS)) delete MOB_KINDS[key];
  Object.assign(MOB_KINDS, kinds);
}

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

/**
 * The hero level a foe is a match for, read from its own body (attack and health, so no content has to say): a goblin is 1,
 * an orc about 5, a troll about 8, a warlord about 11. The content's notes name the same bands.
 */
export const mobLevel = (kind: Pick<MobKind, 'attack' | 'maxHp' | 'level'>): number =>
  kind.level ?? Math.max(1, Math.round((kind.attack / 4 + kind.maxHp / 20) / 2));

/**
 * The share of a kill's XP a hero of `level` still gets from `kind`: all of it while the foe is within three levels of
 * them, then 20% less for each level beyond, never below a tenth. Killing what you have outgrown is not how you level
 * (and a hero of level 30 who walks the old lands does not get richer by it). Bosses always pay in full.
 */
export function killShare(level: number, kind: Pick<MobKind, 'attack' | 'maxHp' | 'level' | 'boss'>): number {
  if (kind.boss) return 1;
  const gap = level - mobLevel(kind) - 3;
  return gap <= 0 ? 1 : Math.max(0.1, 1 - 0.2 * gap);
}

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
