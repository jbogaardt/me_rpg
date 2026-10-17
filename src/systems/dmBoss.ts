// The boss of a boss quest (Pixi-free, tested; core engine, co-op). A boss is not content: it is a foe the land already has
// (the toughest kind alive in it, by its own look, speed, shots and timings) drawn as a giant and given a named, level-made
// body: its health, blow and defense come from what a party of that level and size is (`heroModel`), never from the kind's
// own numbers, so it is a real fight at any level and in any world. It names no content id: the kind is whatever key the
// land hands over. The host owns it like any foe; a friend rebuilds the same body from the quest on the wire
// (`bossWhat` carries the kind and the health), with the stats it never uses left as the kind's.

import { gainXp, newHero, xpToNext, type MobKind } from './combat';
import { hashOf, seeded } from './phrases';

/** How much bigger than the kind it is drawn (a giant: its reach and lunge grow with it, `Mob`). */
export const BOSS_SCALE = 1.7;
/** The key a boss's kill is counted under: the one thing no kind of the content is called (`quests.ts` `mobKey`). */
export const BOSS_KEY = 'boss';

// The model of a fight: what a typical hero of a level has (the same figures balance.test.ts uses), how fast they swing,
// and how much of the time they get a blow in rather than dodging, and what a boss's blows are worth to them.
const SWING = 0.35; // seconds between plain sword blows
const UPTIME = 0.5; // the share of the time a hero is hitting rather than dodging or closing in
const BLOW = 0.26; // a boss's blow takes this share of a hero's health, after armour
const HIT = 0.25; // the share of its blows that land on someone (they are telegraphed)
const SOLO_SECONDS = 9; // how long a lone hero needs to kill it, in blows that land
const GROWTH = 1.7; // health grows faster than the party's number, so a bigger party is a little easier, not a walk-over

/** A typical hero of `level`: health, damage per blow (attack plus a sword fit for the level) and defense (with armour). */
export function heroModel(level: number): { hp: number; power: number; defense: number } {
  const lv = Math.max(1, Math.round(level));
  const hero = newHero();
  while (hero.stats.level < lv) gainXp(hero.stats, xpToNext(hero.stats.level));
  return {
    hp: hero.stats.maxHp,
    power: hero.stats.attack + Math.round(2 + 0.6 * (lv - 1)),
    defense: hero.stats.defense + Math.max(0, 2 * lv - 2),
  };
}

/** The body of a boss for a party of `size` heroes at `level`: health, attack and defense, and what its kill pays. */
export function bossStats(
  level: number,
  size: number,
): { maxHp: number; attack: number; defense: number; xp: number; gold: number } {
  const lv = Math.max(1, Math.round(level));
  const n = Math.max(1, Math.round(size));
  const h = heroModel(lv);
  const defense = Math.round(0.18 * h.power);
  const perSecond = ((h.power - defense) / SWING) * UPTIME; // one hero's damage a second
  return {
    maxHp: Math.round(perSecond * SOLO_SECONDS * n ** GROWTH),
    attack: h.defense + Math.round(BLOW * h.hp),
    defense,
    xp: Math.round(xpToNext(lv) * 0.2),
    gold: 10 + 3 * lv,
  };
}

/**
 * How the fight is expected to go: seconds a party of `size` takes to wear the boss down, and seconds it lasts under the
 * boss's blows (a lone hero's health spread over what lands on them, shared by the party). A ratio above 1 is a fight the
 * party wins; well above it is a walk-over. `balance.test.ts` keeps it between the two at every level and party size.
 */
export function fightOdds(
  level: number,
  size: number,
  kind: Pick<MobKind, 'maxHp' | 'attack' | 'defense' | 'windup' | 'recover'>,
) {
  const h = heroModel(level);
  const n = Math.max(1, Math.round(size));
  const perSecond = (Math.max(1, h.power - kind.defense) / SWING) * UPTIME * n;
  const cycle = (kind.windup ?? 0.45) + (kind.recover ?? 0.7);
  const blow = Math.max(1, kind.attack - h.defense);
  const rate = (HIT * blow) / cycle; // health lost a second, by someone
  return { kill: kind.maxHp / perSecond, last: (n * h.hp) / rate };
}

/** The shell of a boss that a friend draws (and the host builds on): the kind's own look, drawn as a giant, with `maxHp`. */
export function bossShell(base: MobKind, maxHp: number, name: string): MobKind {
  return { ...base, name, scale: Math.max(base.scale ?? 1, 1) * BOSS_SCALE, maxHp, boss: true };
}

/** The boss, for the host: the kind's look and ways (shots, rays), a level-made body and a slower, plainer telegraph. */
export function bossKind(base: MobKind, level: number, size: number, name: string): MobKind {
  const s = bossStats(level, size);
  return {
    ...bossShell(base, s.maxHp, name),
    attack: s.attack,
    defense: s.defense,
    xp: s.xp,
    gold: s.gold,
    windup: Math.round((base.windup ?? 0.45) * 1.2 * 100) / 100, // a giant's blow is easier to read
    recover: base.recover ?? 0.7,
    stagger: Math.min(base.stagger ?? 0.3, 0.15), // it is not to be juggled
    sight: Math.max(base.sight, 200),
  };
}

const ADJECTIVES = [
  'Hollow',
  'Gaunt',
  'Ashen',
  'Gilded',
  'Ancient',
  'Wretched',
  'Pale',
  'Thorned',
  'Grim',
  'Sunken',
  'Hungering',
  'Crooked',
];
const RANKS = ['King', 'Warlord', 'Tyrant', 'Chieftain', 'Overlord', 'Scourge', 'Terror', 'Despot'];
const MAX_NAME = 44;

/** A name for a boss of the kind called `kind` ("the Hollow Goblin King"), fixed by the seed: no content named. */
export function bossName(kind: string, seed: string): string {
  const h = hashOf(`${kind}${seed}`);
  const adjective = seeded(ADJECTIVES, h);
  const rank = seeded(RANKS, h >>> 3);
  const plural = /s$/i.test(kind) ? kind : `${kind}s`;
  const name = seeded(
    [
      `the ${adjective} ${kind} ${rank}`,
      `the ${kind} ${rank}`,
      `the ${rank} of the ${plural}`,
      `${adjective} ${kind}, the ${rank}`,
    ],
    h >>> 6,
  );
  return name.slice(0, MAX_NAME);
}

/** A boss quest's `what` on the wire: the kind's key and the boss's health ("goblin:480"). */
export const bossWhat = (key: string, maxHp: number): string => `${key}:${maxHp}`;

/** The kind's key and health a boss quest's `what` carries, or null if it is not one. */
export function parseBossWhat(what: string): { key: string; maxHp: number } | null {
  const m = /^(.+):(\d{1,6})$/.exec(what);
  return m ? { key: m[1]!, maxHp: Number(m[2]) } : null;
}

/** The boss's name from its quest's title ("Slay the Hollow Goblin King"). */
export const bossTitle = (name: string): string => `Slay ${name}`;
export const nameOfBossTitle = (title: string): string => title.replace(/^Slay /, '');

/** The foe a boss is made of: the toughest of the land's, by what it is worth. */
export function bossBase<T extends { xp: number }>(mobs: readonly T[]): T | undefined {
  return mobs.reduce<T | undefined>((best, m) => (!best || m.xp > best.xp ? m : best), undefined);
}
