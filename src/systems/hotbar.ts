// The quick-slot hotbar (Pixi-free). Layer: core engine, per-player UI state. A slot only remembers an item *name*, never a
// pack index (indices shift whenever something is worn, drunk or dropped), and using a slot is just an Inventory action
// (`InvOp`), so it goes through the same wish path as the menu: done here, or asked of the host by a co-op guest. Nothing
// here is sent anywhere; the slots are saved in this browser only (the DOM side, hud/Hotbar.ts, does the saving).

import { GEAR_SLOTS, type Hero, type Item } from './combat';
import { slotsFor, type InvOp } from './inventory';

export const HOTBAR_SLOTS = 4;

export class Hotbar {
  private slots: string[] = Array<string>(HOTBAR_SLOTS).fill('');

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
