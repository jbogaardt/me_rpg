// The pack and what moves in and out of it (Pixi-free). A hero carries `BASE_PACK` loose items, plus the capacity of the
// bag on their back. Gear is worn in slots (GEAR_SLOTS); everything else sits in `hero.pack`. Every move here either
// succeeds completely or changes nothing and says why.

import { gainXp, GEAR_SLOTS, type GearSlot, type Hero, type Item } from './combat';
import { ITEMS, type ItemId } from './items';

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

/** Can `item` be worn in `slot`? A one-handed blade (not a bow, wand or tome) fits the off-hand too. */
export function fitsSlot(item: Item, slot: GearSlot): boolean {
  if (item.slot === slot) return true;
  return slot === 'offhand' && item.slot === 'weapon' && !item.ranged && !item.focus;
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
  if (item.rare) return 4;
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
  | 'wand'
  | 'tome'
  | 'sword'
  | 'bow'
  | 'dagger'
  | 'shield'
  | 'helm'
  | 'armor'
  | 'greaves'
  | 'boot'
  | 'cape'
  | 'tool'
  | 'sack'
  | 'backpack'
  | 'charm';

export function iconKind(item: Item): IconKind {
  if (item.ranged) return 'bow';
  if (item.focus) return item.focus.kind;
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
    case 'charm':
      return 'charm';
    default:
      return 'sword';
  }
}

// --- Shops, supplies and the network. Money and what to buy are systems/shops.ts; these are the pack moves they use. ---

/** How many of the extra buffs (speed, regen, XP...) a piece carries. */
const buffCount = (item: Item) =>
  [item.speed, item.magic, item.regen, item.mpRegen, item.xpBonus, item.goldBonus].filter(Boolean).length;

/** A piece's worth in its slot: attack for blades and bows, defense for armor and shields, both added for a mix, and half a point per buff. */
const worth = (item: Item | undefined) => (item ? (item.attack ?? 0) + (item.defense ?? 0) + buffCount(item) / 2 : 0);

/** Is `item` better than what the hero wears in its slot (an empty slot takes anything)? */
export function isBetter(hero: Hero, item: Item): boolean {
  if (!item.slot) return false;
  const current = item.slot === 'weapon' ? hero.weapon : hero[item.slot];
  // A wand or tome plays differently from a blade: never swapped in (or out) on its numbers alone, the player picks it.
  if (current && !!item.focus !== !!current.focus) return false;
  return !current || worth(item) > worth(current);
}

/** How much better (positive) or worse (negative) `item` is than what the hero wears in its slot. */
export const upgrade = (hero: Hero, item: Item): number =>
  item.slot ? worth(item) - worth(item.slot === 'weapon' ? hero.weapon : hero[item.slot]) : 0;

/** Does the hero wear exactly this item? */
export const isWorn = (hero: Hero, item: Item): boolean =>
  item.slot ? (item.slot === 'weapon' ? hero.weapon : hero[item.slot]) === item : false;

export interface PackEntry {
  item: Item;
  count: number;
}

/** The pack grouped by item, in the order each kind first arrived. */
export function packEntries(hero: Hero): PackEntry[] {
  const entries: PackEntry[] = [];
  for (const item of hero.pack) {
    const entry = entries.find((e) => e.item === item);
    if (entry) entry.count++;
    else entries.push({ item, count: 1 });
  }
  return entries;
}

/** Take one of `item` out of the pack. Returns false if there was none. */
export function takeFromPack(hero: Hero, item: Item): boolean {
  const i = hero.pack.indexOf(item);
  if (i < 0) return false;
  hero.pack.splice(i, 1);
  return true;
}

/** Wear one of `item` from the pack (in the slot it belongs to; what was worn goes into the pack in its place). */
export function wearFromPack(hero: Hero, item: Item): Result {
  const index = hero.pack.indexOf(item);
  return index < 0 ? fail('You do not have that.') : equipFromPack(hero, index);
}

/**
 * Put a bought or found piece on if it beats what is worn there, sending the old piece to the pack (the caller checked
 * there is room for it). Returns true if it went on.
 */
export function wearIfBetter(hero: Hero, item: Item): boolean {
  if (!item.slot || !isBetter(hero, item)) return false;
  const old = item.slot === 'weapon' ? hero.weapon : hero[item.slot];
  if (old) hero.pack.push(old);
  hero[item.slot as Exclude<GearSlot, 'weapon'>] = item;
  if (item.slot === 'weapon') hero.weapon = item;
  return true;
}

export interface Used {
  text: string; // short, shown floating over the hero
  levels: number; // level-ups gained (always 0 for now)
}

/** Drink a supply from the pack. Null when there is none, it is not a supply, or it would do nothing. */
export function useFromPack(hero: Hero, item: Item): Used | null {
  const { use } = item;
  const s = hero.stats;
  if (!use || !hero.pack.includes(item)) return null;
  if (s.hp >= s.maxHp && (!use.mp || s.mp >= s.maxMp)) return null;
  takeFromPack(hero, item);
  s.hp = Math.min(s.maxHp, s.hp + use.hp);
  s.mp = Math.min(s.maxMp, s.mp + (use.mp ?? 0));
  return { text: use.mp ? 'HP and MP restored' : `+${use.hp} HP`, levels: gainXp(s, 0) };
}

// --- Item codes: how a hero's gear and pack travel over the network (src/net/protocol.ts). A code is the item's
// place in ITEMS plus one (0 means nothing), so the same build on both sides agrees on every code.

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const ITEM_COUNT = ITEM_IDS.length;

/** The code of an item (0 if it is not one of ITEMS). */
export const itemCode = (item: Item): number => ITEM_IDS.findIndex((id) => ITEMS[id] === item) + 1;

/** The item with this code, or undefined for 0 and unknown codes. */
export const itemFromCode = (code: number): Item | undefined => {
  const id = ITEM_IDS[code - 1];
  return id ? ITEMS[id] : undefined;
};

/** What the hero wears, one code per slot in GEAR_SLOTS order. */
export const gearCodes = (hero: Hero): number[] => GEAR_SLOTS.map((slot) => (hero[slot] ? itemCode(hero[slot]) : 0));

/** Wear exactly what `codes` says (a guest's copy of the host's hero). The weapon slot is never left empty. */
export function setGear(hero: Hero, codes: readonly number[]): void {
  GEAR_SLOTS.forEach((slot, i) => {
    const item = itemFromCode(codes[i] ?? 0);
    if (slot === 'weapon') hero.weapon = item ?? hero.weapon;
    else if (item) hero[slot] = item;
    else delete hero[slot];
  });
}

/** The pack as codes, and back (unknown codes are dropped). */
export const packCodes = (hero: Hero): number[] => hero.pack.map(itemCode);
export const setPack = (hero: Hero, codes: readonly number[]): void => {
  hero.pack = codes.flatMap((c) => itemFromCode(c) ?? []);
};

// --- Pack actions as data (so a co-op guest can ask the host to do them) ---

/** Something a player does on the Inventory screen. */
export type InvOp =
  | { t: 'equip'; index: number; slot?: GearSlot } // pack item -> worn (default: its own slot)
  | { t: 'unequip'; slot: GearSlot }
  | { t: 'use'; index: number } // drink a supply from the pack
  | { t: 'dropPack'; index: number }
  | { t: 'dropWorn'; slot: GearSlot };

/** Seconds an item lies on the ground before it crumbles away. */
export const GROUND_LIFETIME = 180;
/** It starts to blink this many seconds before it goes. */
export const GROUND_WARNING = 20;

/** Seconds left for an item that has lain `age` seconds (never negative). */
export const groundRemaining = (age: number): number => Math.max(0, GROUND_LIFETIME - age);

/** Is an item with this long left about to go (so it should blink)? */
export const groundFading = (remaining: number): boolean => remaining < GROUND_WARNING;

/** Most items lying on the ground in one zone at once (they ride in every co-op snapshot). */
export const MAX_GROUND = 16;

/** Do an action. A drop hands the item back as `dropped` (the caller puts it on the ground). Changes nothing on failure. */
export function applyInvOp(hero: Hero, op: InvOp): Result & { dropped?: Item; text?: string } {
  switch (op.t) {
    case 'equip':
      return equipFromPack(hero, op.index, op.slot);
    case 'unequip':
      return unequip(hero, op.slot);
    case 'use': {
      const item = hero.pack[op.index];
      const used = item && useFromPack(hero, item);
      return used ? { ok: true, text: used.text } : { ok: false, reason: 'You do not need that right now.' };
    }
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

/** The wire form of an action: [kind, a, b], numbers only (slots are GEAR_SLOTS indexes, -1 for none). */
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
    case 'use':
      return [4, op.index, 0];
  }
}

/** Read a wire action back, or null when it is not one (values come from a peer, so nothing is trusted). */
export function decodeOp([kind, a, b]: InvOpWire): InvOp | null {
  const slot = GEAR_SLOTS[a];
  const index = Number.isInteger(a) && a >= 0 && a < 64;
  switch (kind) {
    case 0:
      return index && b >= -1 && b < GEAR_SLOTS.length
        ? { t: 'equip', index: a, ...(b >= 0 ? { slot: GEAR_SLOTS[b] } : {}) }
        : null;
    case 1:
      return slot ? { t: 'unequip', slot } : null;
    case 2:
      return index ? { t: 'dropPack', index: a } : null;
    case 3:
      return slot ? { t: 'dropWorn', slot } : null;
    case 4:
      return index ? { t: 'use', index: a } : null;
    default:
      return null;
  }
}
