// The quick-slot hotbar (Pixi-free). Layer: core engine, per-player UI state. A slot only remembers an item *name*, never a
// pack index (indices shift whenever something is worn, drunk or dropped), and using a slot is just an Inventory action
// (`InvOp`), so it goes through the same wish path as the menu: done here, or asked of the host by a co-op guest. Nothing
// here is sent anywhere; the slots are saved in this browser only (the DOM side, hud/Hotbar.ts, does the saving).

import { GEAR_SLOTS, type Hero, type Item } from './combat';
import { slotsFor, type InvOp } from './inventory';

/** Slots kept in storage (saved data from the four-slot bar still loads). */
export const HOTBAR_SLOTS = 4;
/** Slots the player sees and cycles; the last stored slot is hidden, not deleted. */
export const HOTBAR_SHOWN = 3;
/** Seconds the quick button rests after a successful use, so it cannot be spammed. */
export const ITEM_COOLDOWN_S = 0.6;

export class Hotbar {
  private slots: string[] = Array<string>(HOTBAR_SLOTS).fill('');
  /** The shown slot the quick button points at (local UI state, never saved or sent). */
  selected = 0;

  constructor(saved?: unknown) {
    if (Array.isArray(saved))
      for (let i = 0; i < HOTBAR_SLOTS; i++) {
        const v: unknown = saved[i];
        if (typeof v === 'string' && v.length <= 64) this.slots[i] = v;
      }
  }

  get(slot: number): string {
    return this.slots[slot] ?? '';
  }

  /** Put an item's name in a slot. The same item is never in two slots: it moves. */
  assign(slot: number, item: Item) {
    if (slot < 0 || slot >= HOTBAR_SLOTS) return;
    this.slots = this.slots.map((n) => (n === item.name ? '' : n));
    this.slots[slot] = item.name;
  }

  clear(slot: number) {
    if (slot >= 0 && slot < HOTBAR_SLOTS) this.slots[slot] = '';
  }

  /** The slot holding this item, or -1. */
  slotOf(item: Item): number {
    return this.slots.indexOf(item.name);
  }

  /**
   * Move the selection to the next (`dir` 1) or previous (-1) shown slot that holds a consumable the hero carries,
   * wrapping round, skipping empty slots and items no longer in the pack. Stays put (false) when no other slot qualifies.
   * A selected slot whose item has left the pack is kept until the player cycles away from it.
   */
  step(hero: Hero, dir: 1 | -1): boolean {
    for (let n = 1; n <= HOTBAR_SHOWN; n++) {
      const i = (((this.selected + dir * n) % HOTBAR_SHOWN) + HOTBAR_SHOWN) % HOTBAR_SHOWN;
      if (i !== this.selected && quickOp(hero, this.get(i))) {
        this.selected = i;
        return true;
      }
    }
    return false;
  }

  next(hero: Hero): boolean {
    return this.step(hero, 1);
  }

  prev(hero: Hero): boolean {
    return this.step(hero, -1);
  }

  /** Point at a shown slot (a number key) when it holds something usable; false otherwise. */
  select(hero: Hero, slot: number): boolean {
    if (slot < 0 || slot >= HOTBAR_SHOWN || !quickOp(hero, this.get(slot))) return false;
    this.selected = slot;
    return true;
  }

  /** The shown slots a swipe can reach (usable now), in order. */
  ring(hero: Hero): number[] {
    return Array.from({ length: HOTBAR_SHOWN }, (_, i) => i).filter((i) => quickOp(hero, this.get(i)));
  }

  toJSON(): string[] {
    return [...this.slots];
  }
}

/** What a slot shows right now. */
export interface HotbarView {
  /** The item the slot names (the worn one, else the first carried), if the hero has it. */
  item?: Item;
  /** It is already in hand or on the body. */
  worn: boolean;
  /** How many are carried in the pack. */
  count: number;
}

export function viewSlot(hero: Hero, name: string): HotbarView {
  if (!name) return { worn: false, count: 0 };
  const count = hero.pack.filter((i) => i.name === name).length;
  const worn = GEAR_SLOTS.map((s) => hero[s]).find((i) => i?.name === name);
  const item = worn ?? hero.pack.find((i) => i.name === name);
  return { ...(item ? { item } : {}), worn: !!worn, count };
}

/**
 * The Inventory action a tap on the slot means, or null when there is nothing to do (empty slot, or the item is not
 * carried, e.g. already worn). A drinkable is drunk, gear is worn (a weapon or tool switch).
 */
export function slotOp(hero: Hero, name: string): InvOp | null {
  if (!name) return null;
  const index = hero.pack.findIndex((i) => i.name === name);
  const item = hero.pack[index];
  if (!item) return null;
  if (item.use) return { t: 'use', index };
  return slotsFor(item).length ? { t: 'equip', index } : null;
}

/** The quick button's action for a slot: only a consumable (an item with `use`) that is in the pack, else null. */
export function quickOp(hero: Hero, name: string): InvOp | null {
  const op = slotOp(hero, name);
  return op?.t === 'use' ? op : null;
}

/** Gesture on the quick button, from how far (px) and how long (ms) a finger moved. Tap and swipe never overlap. */
export const TAP_MAX_PX = 16;
export const TAP_MAX_MS = 250;
export const SWIPE_MIN_PX = 24;
export type Gesture = 'tap' | 'prev' | 'next' | 'none';

/** A swipe is decided as soon as the finger passes SWIPE_MIN_PX sideways (`ms` is ignored); a tap only on release. */
export function swipeOf(dx: number, dy: number): 'prev' | 'next' | null {
  return Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'prev' : 'next') : null;
}

/** What a finished press means: a short, still press is a tap; anything else (slow, drifted, swiped up) does nothing. */
export function releaseOf(dx: number, dy: number, ms: number): Gesture {
  if (Math.hypot(dx, dy) < TAP_MAX_PX && ms < TAP_MAX_MS) return 'tap';
  return 'none';
}
