// Gems and the pieces they are set in (Pixi-free, tested; core engine behind the `forge` capability). A gem is an item with a
// `gem` property (content: items.json) saying what it adds; setting one in any suitable piece of gear makes a new piece:
// "Emerald-encrusted Steel Sword", the base's numbers plus the gem's, worth more, looking the same. The rule is pure and
// derives the piece from ANY base, so no id is named here.
//
// Derived pieces are real items, made ahead of time: `fusions(items)` makes one for every (base, gem) pair when a campaign's
// items are installed (systems/items.ts), in a fixed order after the authored items. Item codes (what travels in a `pack`,
// `looks` or trade message) are places in that list, so both co-op players, who play the same content, agree on every one
// without anything new on the wire, and a saved or traded piece is just an item. The authored list stays append-only; the
// derived pieces follow it, so adding authored items (or a gem) renumbers only the derived ones, as a new build does anyway.

import type { GearSlot, Item } from './combat';

/** The buffs a gem can add to a piece of gear: the numbers an item carries, summed over everything worn. */
export const BONUS_KEYS = ['attack', 'defense', 'speed', 'magic', 'regen', 'mpRegen', 'xpBonus', 'goldBonus'] as const;
export type BonusKey = (typeof BONUS_KEYS)[number];
export type Bonus = Partial<Record<BonusKey, number>>;

/** What a gem adds to the piece it is set in: `arms` to a weapon or a blade in the off-hand, `worn` to anything else. */
export interface Gem {
  arms: Bonus;
  worn: Bonus;
}

/** Where a gem can be set: not in supplies, bags or tools (a bag holds, a tool does), and a piece takes one gem. */
export const SOCKET_SLOTS: readonly GearSlot[] = [
  'weapon',
  'offhand',
  'head',
  'chest',
  'legs',
  'feet',
  'cape',
  'charm',
];

/** The id of the piece made of `base` and `gem` (stable: it names both). */
export const fusedId = (base: string, gem: string): string => `${base}+${gem}`;

export const isGem = (item: Item): boolean => item.gem !== undefined;

/** Can `gem` be set in `base`? A gear piece that is not a gem, not a supply and not already set with one. */
export function canSet(gem: Item, base: Item): boolean {
  return (
    gem.gem !== undefined &&
    base.slot !== undefined &&
    SOCKET_SLOTS.includes(base.slot) &&
    base.use === undefined &&
    base.gem === undefined &&
    base.fused === undefined
  );
}

/** Does the piece fight (a weapon, or a blade in the off-hand) rather than guard? It takes the gem's `arms` bonus. */
export const isArms = (base: Item): boolean => base.slot === 'weapon' || (base.slot === 'offhand' && !base.defense);

/** What `gem` adds to `base`. */
export const bonusFor = (gem: Item, base: Item): Bonus => (isArms(base) ? gem.gem?.arms : gem.gem?.worn) ?? {};

const round = (n: number) => Math.round(n * 100) / 100;

/** The piece made of `base` (id `baseId`) with `gem` (id `gemId`) set in it. Throws if the gem does not fit. */
export function fuse(base: Item, baseId: string, gem: Item, gemId: string): Item {
  if (!canSet(gem, base)) throw new Error(`${gem.name} cannot be set in ${base.name}`);
  const out: Item = { ...base, name: `${gem.name}-encrusted ${base.name}`, fused: { base: baseId, gem: gemId } };
  for (const [key, add] of Object.entries(bonusFor(gem, base)) as [BonusKey, number][])
    out[key] = round((base[key] ?? 0) + add);
  out.value = (base.value ?? 0) + Math.max(1, gem.value ?? 0);
  return out;
}

/** Every piece that can be made from the items: for each base in order, for each gem in order (the order is the codes). */
export function fusions(items: Record<string, Item>): Record<string, Item> {
  const out: Record<string, Item> = {};
  const entries = Object.entries(items);
  const gems = entries.filter(([, i]) => isGem(i));
  if (!gems.length) return out;
  for (const [baseId, base] of entries)
    for (const [gemId, gem] of gems)
      if (canSet(gem, base)) out[fusedId(baseId, gemId)] = fuse(base, baseId, gem, gemId);
  return out;
}

/** What setting a gem adds, as words ("+0.3 HP/s"); one piece per bonus. */
export function bonusTexts(b: Bonus): string[] {
  const text: Record<BonusKey, (n: number) => string> = {
    attack: (n) => `+${n} ATK`,
    defense: (n) => `+${n} DEF`,
    speed: (n) => `+${n}% speed`,
    magic: (n) => `+${n} magic`,
    regen: (n) => `+${n} HP/s`,
    mpRegen: (n) => `+${n} MP/s`,
    xpBonus: (n) => `+${n}% XP`,
    goldBonus: (n) => `+${n}% gold`,
  };
  return BONUS_KEYS.flatMap((k) => (b[k] ? [text[k](b[k])] : []));
}
