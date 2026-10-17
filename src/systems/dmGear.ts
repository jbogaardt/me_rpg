// The gear the Dungeon Master hands out as a reward (Pixi-free, tested; core engine). Not always a sword: for each hero it
// weighs every piece the campaign has (a weapon, a shield, a helm, armour, boots, a cloak, a bag, a charm, a wand or a tome) by
// how much it improves what THAT hero wears, leaves out a kind they cannot use (a bow user is never handed a sword, a mage never
// a bow), keeps to what a hero of the party's level could fairly have earned, and rotates the slot: the kind of piece given last
// time is not given again while anything else would help. Nothing here names a content id. The caller (the scene) keeps each
// hero's memory of what was given (`GiftMemory`) and a seed (the quest's number), and hands the piece out through `collect`.

import type { GearSlot, Hero, Item } from './combat';
import { upgrade } from './inventory';
import { hashOf } from './phrases';

/** Quests whose reward is a piece of gear, beside XP and gold; a saga's finale pays one too, and a `find` pays its relic. Small hunts, hauls and the like pay XP and gold. */
export const GEAR_KINDS: readonly string[] = ['forge'];

/** A weapon's way of fighting: a gift never swaps a blade for a bow or a wand (the player chose how they fight). */
const style = (i: Item): string => (i.focus ? 'focus' : i.ranged ? 'ranged' : 'melee');

/** How many of the last gifts a hero remembers (the slots they were for). */
export const MEMORY = 3;

/** What the DM remembers having given each hero: the slots, newest first. */
export type GiftMemory = WeakMap<object, GearSlot[]>;

/** Note that `hero` was given a piece for `slot`. */
export function remember(memory: GiftMemory, hero: Hero, slot: GearSlot): void {
  memory.set(hero, [slot, ...(memory.get(hero) ?? [])].slice(0, MEMORY));
}

/**
 * How much `item` would improve what the hero wears in its slot (zero or less: it would not): the usual worth of a piece
 * for the weapon, shield, armour, cloak and charm, and for a bag its extra pack slots (four slots count as one point).
 */
export function gain(hero: Hero, item: Item): number {
  if (item.slot === 'bag') return ((item.capacity ?? 0) - (hero.bag?.capacity ?? 0)) / 4;
  return upgrade(hero, item);
}

/** Can the hero be given `item` at all: gear of a kind they can use, that is not a gem, a made piece or a tool. */
function usable(hero: Hero, item: Item): boolean {
  if (item.slot === undefined || item.slot === 'tool' || item.use !== undefined || (item.value ?? 0) <= 0) return false;
  if (item.gem !== undefined || item.fused !== undefined) return false;
  return item.slot !== 'weapon' || style(item) === style(hero.weapon);
}

export interface Gift {
  id: string;
  slot: GearSlot;
}

/**
 * The gear to hand `hero` at `level`: a piece better than what they wear, of the way they already fight, worth no more
 * than about twice what a hero of `level` would have earned (a step, not a leap). Among the slots where such a piece
 * exists it leaves out the ones given last (`recent`, newest first) while others remain, takes from the few that help most
 * (the `seed` picks which, so the next quest gives another), and within a slot takes one of the best pieces (the seed
 * again, so heroes with the same gear are not all handed the same item). Null when nothing would help.
 */
export function giftFor(
  hero: Hero,
  items: Record<string, Item>,
  level: number,
  recent: readonly GearSlot[] = [],
  seed = 0,
): Gift | null {
  const cap = 2 * (30 + 25 * level);
  const bySlot = new Map<GearSlot, { id: string; item: Item; gain: number }[]>();
  for (const [id, item] of Object.entries(items)) {
    if (!usable(hero, item) || (item.value ?? 0) > cap) continue;
    const g = gain(hero, item);
    if (g > 0) bySlot.set(item.slot!, [...(bySlot.get(item.slot!) ?? []), { id, item, gain: g }]);
  }
  if (!bySlot.size) return null;
  const best = (slot: GearSlot) => Math.max(...bySlot.get(slot)!.map((o) => o.gain));
  // the slots, those not given lately first (the last one given is left out whenever anything else would help)
  const lastGiven = recent[0];
  let slots = [...bySlot.keys()];
  const fresh = slots.filter((s) => !recent.includes(s));
  const other = slots.filter((s) => s !== lastGiven);
  slots = fresh.length ? fresh : other.length ? other : slots;
  slots.sort((a, b) => best(b) - best(a) || a.localeCompare(b));
  const slot = slots[Math.abs(seed) % Math.min(3, slots.length)]!;
  const options = bySlot.get(slot)!.sort((a, b) => b.gain - a.gain || a.id.localeCompare(b.id));
  const top = options.filter((o) => o.gain >= options[0]!.gain * 0.8);
  const pick = top[hashOf(`${hero.name}${seed}${slot}`) % top.length]!;
  return { id: pick.id, slot };
}
