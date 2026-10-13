import { describe, expect, it } from 'vitest';
import type { Outfit } from '../sprites/doll';
import { GEAR_SLOTS, newHero, type GearSlot, type Item } from './combat';
import { equip, ITEMS } from './items';
import { SHOPS } from './shops';

const everything = Object.entries(ITEMS);
// Gear: everything with a slot (supplies, the potions, have none).
const items = everything.filter(([, i]) => 'slot' in i) as unknown as [
  string,
  Item & { slot: GearSlot; look: Outfit },
][];

describe('ITEMS', () => {
  it.each(everything)('%s has a price', (_id, item) => {
    expect(item.value).toBeGreaterThan(0);
  });

  it('keeps supplies out of the gear slots and gives them something to restore', () => {
    for (const [id, item] of everything.filter(([, i]) => !('slot' in i))) {
      const use = (item as Item).use;
      expect((use?.hp ?? 0) + (use?.mp ?? 0) + (use?.food ?? 0) + (use?.water ?? 0) > 0, id).toBe(true);
    }
  });

  it.each(items)('%s goes in a real slot and does something', (_id, item) => {
    expect(GEAR_SLOTS as readonly string[]).toContain(item.slot);
    const buffs = [item.speed, item.magic, item.regen, item.mpRegen, item.xpBonus, item.goldBonus];
    const worth = (item.attack ?? 0) + (item.defense ?? 0) + (item.capacity ?? 0);
    expect(worth + buffs.reduce<number>((n, b) => n + (b ?? 0), 0)).toBeGreaterThan(0);
  });

  it('gives every rare piece a buff, and keeps rare pieces out of the shops', () => {
    const sold = new Set<string>(Object.values(SHOPS).flatMap((shop) => shop.stock));
    for (const [id, item] of items.filter(([, i]) => i.rare)) {
      const buffs = [item.speed, item.magic, item.regen, item.mpRegen, item.xpBonus, item.goldBonus];
      expect(buffs.some(Boolean), id).toBe(true);
      expect(sold.has(id), id).toBe(false);
    }
  });

  it('has several pieces for every armor slot, and shields and blades for the off-hand', () => {
    for (const slot of ['head', 'chest', 'legs', 'feet'] as const) {
      expect(items.filter(([, i]) => i.slot === slot).length, slot).toBeGreaterThanOrEqual(3);
    }
    const offhand = items.filter(([, i]) => i.slot === 'offhand');
    expect(offhand.some(([, i]) => 'defense' in i)).toBe(true); // a shield
    expect(offhand.some(([, i]) => 'attack' in i)).toBe(true); // a second weapon
  });

  it('keeps armor in the doll slot that matches where it is worn', () => {
    const dollSlot = {
      head: 'headwear',
      chest: 'torso',
      legs: 'legs',
      feet: 'feet',
      cape: 'cape',
      offhand: 'shield',
      weapon: 'weapon',
      tool: undefined, // tools, bags and charms are not drawn on the doll
      bag: undefined,
      charm: undefined,
    };
    for (const [id, item] of items) {
      const part = dollSlot[item.slot];
      // Wands and tomes have no art on the hero yet, so their look is empty.
      const drawn = 'focus' in item || !part ? [] : [part];
      expect(Object.keys(item.look), id).toEqual(drawn);
    }
  });

  it('lets only weapons shoot, and every bow reaches farther than a bolt', () => {
    const bows = items.filter(([, i]) => 'ranged' in i);
    expect(bows.length).toBeGreaterThanOrEqual(2);
    for (const [id, item] of bows) {
      expect(item.slot, id).toBe('weapon');
      const { speed, range, cooldown } = (item as { ranged: { speed: number; range: number; cooldown: number } })
        .ranged;
      expect(speed).toBeGreaterThan(120); // faster than the hero walks
      expect(range).toBeGreaterThan(7 * 32); // a wand's bolt flies 7 cells
      expect(cooldown).toBeGreaterThan(0.35); // slower between shots than a sword
    }
  });
});

describe('equip', () => {
  it('replaces only the slot the item belongs to', () => {
    const hero = newHero();
    equip(hero, ITEMS.vikingHelm);
    equip(hero, ITEMS.kiteShield);
    equip(hero, ITEMS.shortBow);
    expect(hero).toMatchObject({ head: ITEMS.vikingHelm, offhand: ITEMS.kiteShield, weapon: ITEMS.shortBow });
    equip(hero, ITEMS.greatHelm);
    expect(hero.head).toBe(ITEMS.greatHelm);
    expect(hero.cape).toBe(ITEMS.travelerCloak);
  });

  it('refuses an item with no slot', () => {
    expect(() => equip(newHero(), { name: 'Pebble' })).toThrow(/no slot/);
  });
});
