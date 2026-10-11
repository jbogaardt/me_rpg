// The pack and what moves in and out of it (Pixi-free). A hero carries `BASE_PACK` loose items, plus the capacity of the
// bag on their back. Gear is worn in slots (GEAR_SLOTS); everything else sits in `hero.pack`. Every move here either
// succeeds completely or changes nothing and says why.

import { GEAR_SLOTS, type GearSlot, type Hero, type Item } from './combat';
import { ITEMS } from './items';

/** Pack slots with no bag. A sack or backpack (slot `bag`, `capacity`) adds to it while worn. */
export const BASE_PACK = 10;

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

/** How many items the hero can carry right now. */
export const packSize = (hero: Hero): number => BASE_PACK + (hero.bag?.capacity ?? 0);

export const packFree = (hero: Hero): number => packSize(hero) - hero.pack.length;

/** Does the hero have room for one more? */
export const hasRoom = (hero: Hero): boolean => packFree(hero) > 0;

/** Can `item` be worn in `slot`? A one-handed (non-bow) weapon fits the off-hand too. */
export function fitsSlot(item: Item, slot: GearSlot): boolean {
  if (item.slot === slot) return true;
  return slot === 'offhand' && item.slot === 'weapon' && !item.ranged;
}

/** Slots an item can go in, the natural one first (the weapon slot before the off-hand). */
export const slotsFor = (item: Item): GearSlot[] => GEAR_SLOTS.filter((slot) => fitsSlot(item, slot));

/** Put a carried item in the pack. Returns false (and does nothing) when the pack is full. */
export function addToPack(hero: Hero, item: Item): boolean {
  if (!hasRoom(hero)) return false;
  hero.pack.push(item);
  return true;
}

/**
 * Wear the item at `index` in the pack. It goes in `slot` (default: the slot it belongs to); whatever was worn there
 * takes its place in the pack. A bag that holds less than the pack now carries is refused.
 */
export function equipFromPack(hero: Hero, index: number, slot?: GearSlot): Result {
  const item = hero.pack[index];
  if (!item) return fail('Nothing there.');
  const target = slot ?? slotsFor(item)[0];
  if (!target || !fitsSlot(item, target)) return fail(`${item.name} cannot be worn there.`);
  const old = target === 'weapon' ? hero.weapon : hero[target];
  if (target === 'bag' && hero.pack.length > BASE_PACK + (item.capacity ?? 0)) {
    return fail(`Too much to carry: ${item.name} holds ${BASE_PACK + (item.capacity ?? 0)}.`);
  }
  if (old) hero.pack[index] = old;
  else hero.pack.splice(index, 1);
  hero[target as Exclude<GearSlot, 'weapon'>] = item;
  if (target === 'weapon') hero.weapon = item;
  return OK;
}

/** Why the worn piece in `slot` cannot leave the hero, or null if it can (a bag must leave the pack within its size). */
function cannotRemove(hero: Hero, slot: GearSlot, intoPack: boolean): string | null {
  if (slot === 'weapon') return 'You need a weapon in hand; equip another to swap.';
  const item = hero[slot];
  if (!item) return 'Nothing there.';
  // Taking off a bag shrinks the pack; what is carried must still fit (one more goes in the pack if it is kept).
  if (slot === 'bag' && hero.pack.length + (intoPack ? 1 : 0) > BASE_PACK) {
    return `Too much to carry without ${item.name}: free up ${hero.pack.length + (intoPack ? 1 : 0) - BASE_PACK}.`;
  }
  if (intoPack && slot !== 'bag' && !hasRoom(hero)) return 'Your pack is full.';
  return null;
}

/** Take off the item in `slot` and put it in the pack. */
export function unequip(hero: Hero, slot: GearSlot): Result {
  const why = cannotRemove(hero, slot, true);
  if (why) return fail(why);
  const item = hero[slot as Exclude<GearSlot, 'weapon'>]!;
  delete hero[slot as Exclude<GearSlot, 'weapon'>];
  hero.pack.push(item);
  return OK;
}

/** Take the item in the pack at `index` out of the game (the caller puts it on the ground). */
export function dropFromPack(hero: Hero, index: number): Item | undefined {
  return hero.pack.splice(index, 1)[0];
}

/** Take off whatever is worn in `slot` and hand it back to drop on the ground. The weapon cannot go; a bag only if the pack still fits. */
export function dropWorn(hero: Hero, slot: GearSlot): Result & { item?: Item } {
  const why = cannotRemove(hero, slot, false);
  if (why) return fail(why);
  const item = hero[slot as Exclude<GearSlot, 'weapon'>]!;
  delete hero[slot as Exclude<GearSlot, 'weapon'>];
  return { ok: true, item };
}

/** How good an item is, 1 (plain) to 4 (best): drives the colour of its slot and its glow on the ground. */
export function itemTier(item: Item): number {
  if (item.capacity) return item.capacity >= 8 ? 3 : 2;
  return Math.max(1, Math.min(4, (item.attack ?? 0) + (item.defense ?? 0)));
}

/** What `item` adds over what is worn in its slot: positive numbers are better. */
export function compare(item: Item, worn: Item | undefined) {
  return {
    attack: (item.attack ?? 0) - (worn?.attack ?? 0),
    defense: (item.defense ?? 0) - (worn?.defense ?? 0),
  };
}

/** Which picture an item gets in the pack screen. */
export type IconKind =
  'sword' | 'bow' | 'dagger' | 'shield' | 'helm' | 'armor' | 'greaves' | 'boot' | 'cape' | 'tool' | 'sack' | 'backpack';

export function iconKind(item: Item): IconKind {
  if (item.ranged) return 'bow';
  switch (item.slot) {
    case 'offhand':
      return item.attack && !item.defense ? 'dagger' : 'shield';
    case 'head':
      return 'helm';
    case 'chest':
      return 'armor';
    case 'legs':
      return 'greaves';
    case 'feet':
      return 'boot';
    case 'cape':
      return 'cape';
    case 'tool':
      return 'tool';
    case 'bag':
      return (item.capacity ?? 0) >= 8 ? 'backpack' : 'sack';
    default:
      return 'sword';
  }
}

// --- Inventory actions as data (so a co-op guest can ask the host to do them) ---

/** Something a player does on the pack screen. */
export type InvOp =
  | { t: 'equip'; index: number; slot?: GearSlot } // pack item -> worn (default: its own slot)
  | { t: 'unequip'; slot: GearSlot }
  | { t: 'dropPack'; index: number }
  | { t: 'dropWorn'; slot: GearSlot };

/** Most items lying on the ground at once (they ride in every co-op snapshot). */
export const MAX_GROUND = 16;

/** Do an action. A drop hands the item back as `dropped` (the caller puts it on the ground). Changes nothing on failure. */
export function applyInvOp(hero: Hero, op: InvOp): Result & { dropped?: Item } {
  switch (op.t) {
    case 'equip':
      return equipFromPack(hero, op.index, op.slot);
    case 'unequip':
      return unequip(hero, op.slot);
    case 'dropPack': {
      if (!hero.pack[op.index]) return fail('Nothing there.');
      return { ok: true, dropped: dropFromPack(hero, op.index) };
    }
    case 'dropWorn': {
      const r = dropWorn(hero, op.slot);
      return r.ok ? { ok: true, dropped: r.item } : r;
    }
  }
}

/** The wire form of an action: [kind, a, b] with numbers only (slots are GEAR_SLOTS indexes, -1 for none). */
export type InvOpWire = [number, number, number];

export function encodeOp(op: InvOp): InvOpWire {
  const slot = (g: GearSlot | undefined) => (g ? GEAR_SLOTS.indexOf(g) : -1);
  switch (op.t) {
    case 'equip':
      return [0, op.index, slot(op.slot)];
    case 'unequip':
      return [1, slot(op.slot), 0];
    case 'dropPack':
      return [2, op.index, 0];
    case 'dropWorn':
      return [3, slot(op.slot), 0];
  }
}

/** Read a wire action back, or null when it is not one (values come from a peer, so nothing is trusted). */
export function decodeOp([kind, a, b]: InvOpWire): InvOp | null {
  const slot = GEAR_SLOTS[a];
  switch (kind) {
    case 0:
      return Number.isInteger(a) && a >= 0 && a < 64 && b >= -1 && b < GEAR_SLOTS.length
        ? { t: 'equip', index: a, ...(b >= 0 ? { slot: GEAR_SLOTS[b] } : {}) }
        : null;
    case 1:
      return slot ? { t: 'unequip', slot } : null;
    case 2:
      return Number.isInteger(a) && a >= 0 && a < 64 ? { t: 'dropPack', index: a } : null;
    case 3:
      return slot ? { t: 'dropWorn', slot } : null;
    default:
      return null;
  }
}

// --- Item codes and loadouts ---

/** Every item, in a fixed order: an item's code is its place here plus one (0 is "nothing"). */
const ITEM_LIST: readonly Item[] = Object.values(ITEMS);
export const ITEM_COUNT = ITEM_LIST.length;

export const itemCode = (item: Item | undefined): number => (item ? ITEM_LIST.indexOf(item) + 1 : 0);
export const itemFromCode = (code: number): Item | undefined => ITEM_LIST[code - 1];

/** What a hero wears and carries. `gear` has one code per GEAR_SLOTS entry, `pack` one per carried item. */
export interface Loadout {
  gear: number[];
  pack: number[];
}

export function loadoutOf(hero: Hero): Loadout {
  return { gear: GEAR_SLOTS.map((slot) => itemCode(hero[slot])), pack: hero.pack.map(itemCode) };
}

/** Make `hero` wear and carry exactly this. An unknown code is skipped, and the weapon is kept when none is given. */
export function applyLoadout(hero: Hero, loadout: Loadout): void {
  for (const [i, slot] of GEAR_SLOTS.entries()) {
    const item = itemFromCode(loadout.gear[i] ?? 0);
    if (slot === 'weapon') {
      if (item) hero.weapon = item;
    } else if (item) hero[slot] = item;
    else delete hero[slot];
  }
  hero.pack = loadout.pack.flatMap((code) => itemFromCode(code) ?? []);
}

export const sameLoadout = (a: Loadout, b: Loadout): boolean =>
  a.gear.join() === b.gear.join() && a.pack.join() === b.pack.join();
