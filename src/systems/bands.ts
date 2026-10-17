// Level bands (Pixi-free, tested; core engine, co-op). A zone, or a group of its roamers, may say which hero level it is made
// for (`RoamRule.level`, `Placement.level`), and its foes are then re-banded: the same look, speed, shots and timings, but a
// body made for that level, so the far reaches of a world are dangerous to a party that has outgrown its start and the near
// ones stay gentle. A foe keeps its character (a troll is still the tank and a wolf the glass cannon): its health follows
// how long it takes a hero of the level to kill it, its blow how much of a hero's health it takes (both read from
// `heroModel`, the figures `balance.test.ts` holds boss fights to), and its pay follows the level (`xpToNext`, `goldScale`).
// It names no content id. Both players derive the same kind from the same content, so co-op needs nothing on the wire: the
// host's snapshot refers to mobs by index and the guest builds the same bodies.

import { BAND_MARK, MOB_KINDS, mobLevel, xpToNext, type MobKind } from './combat';
import { heroModel } from './dmBoss';
import { goldScale } from './dmQuests';

/** The highest level a zone may be banded to (the heroes' own curve is not tested beyond it). */
export const MAX_BAND = 50;

/** How much a blow of a kind takes of a typical hero's health, kept within what feels fair (a real threat, never a one-hit end). */
const BLOW = { min: 0.08, max: 0.3 };

/** A title for a foe far past its own level: "Veteran Orc". */
export function rankName(name: string, levels: number): string {
  const rank =
    levels >= 15 ? 'Ancient' : levels >= 10 ? 'Elder' : levels >= 6 ? 'Veteran' : levels >= 3 ? 'Seasoned' : '';
  return rank ? `${rank} ${name}` : name;
}

/** `base` made for heroes of `level`: the same kind, a different body (`base` itself when it is already for that level). */
export function bandKind(base: MobKind, level: number): MobKind {
  const to = Math.min(MAX_BAND, Math.max(1, Math.round(level)));
  const from = mobLevel(base);
  if (base.boss || base.named || to === from) return base;
  const then = heroModel(from);
  const now = heroModel(to);
  const defense = Math.round((base.defense * now.power) / then.power);
  const hits = Math.max(1, then.power - base.defense); // damage a hero of the kind's own level deals to it
  const maxHp = Math.max(1, Math.round((base.maxHp * Math.max(1, now.power - defense)) / hits));
  const blow = Math.min(BLOW.max, Math.max(BLOW.min, (base.attack - then.defense) / then.hp)); // the share of a hero it takes
  return {
    ...base,
    name: rankName(base.name, to - from),
    level: to,
    maxHp,
    attack: now.defense + Math.round(blow * now.hp),
    defense,
    xp: Math.max(1, Math.round((base.xp * xpToNext(to)) / xpToNext(from))),
    gold: Math.max(1, Math.round((base.gold * goldScale(to)) / goldScale(from))),
  };
}

/**
 * The kind of content key `key` banded to `level`, registered once under "key@level" (so `mobKey` still counts it as `key`),
 * or the plain kind when no level is asked. Unknown keys give undefined.
 */
export function bandedKind(key: string, level?: number): MobKind | undefined {
  const base = MOB_KINDS[key];
  if (!base || level === undefined) return base;
  const id = `${key}${BAND_MARK}${level}`;
  return (MOB_KINDS[id] ??= bandKind(base, level));
}
