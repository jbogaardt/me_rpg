import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, newHero, type Item } from './combat';
import { equip, ITEMS } from './items';

const items: [string, Item][] = Object.entries(ITEMS);
const gear = items.filter(([, item]) => !item.use); // everything but supplies
const supplies = items.filter(([, item]) => item.use);

describe('ITEMS', () => {
  it.each(supplies)('%s is a supply: no slot, and it heals something', (_id, item) => {
    expect(item.slot).toBeUndefined();
    expect(item.use?.hp).toBeGreaterThan(0);
  });

  it.each(items)('%s has a price a shop can use', (_id, item) => {
    expect(item.value).toBeGreaterThan(0);
  });

  it.each(gear)('%s goes in a real slot and does something', (_id, item) => {
    expect(GEAR_SLOTS as readonly string[]).toContain(item.slot);
    expect((item.attack ?? 0) + (item.defense ?? 0) + (item.capacity ?? 0)).toBeGreaterThan(0);
  });

  it('has several pieces for every armor slot, and shields and blades for the off-hand', () => {
    for (const slot of ['head', 'chest', 'legs', 'feet'] as const) {
      expect(items.filter(([, i]) => i.slot === slot).length, slot).toBeGreaterThanOrEqual(3);
    }
    const offhand = items.filter(([, i]) => i.slot === 'offhand');
    expect(offhand.some(([, i]) => i.defense)).toBe(true); // a shield
    expect(offhand.some(([, i]) => i.attack)).toBe(true); // a second weapon
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
      tool: undefined, // tools and bags are not drawn on the doll
      bag: undefined,
    };
    for (const [id, item] of gear) {
      const part = dollSlot[item.slot as keyof typeof dollSlot];
      expect(Object.keys(item.look ?? {}), id).toEqual(part ? [part] : []);
    }
  });

  it('lets only weapons shoot, and every bow reaches farther than the Time Bolt', () => {
    const bows = items.filter(([, i]) => i.ranged);
    expect(bows.length).toBeGreaterThanOrEqual(2);
    for (const [id, item] of bows) {
      expect(item.slot, id).toBe('weapon');
      const { speed, range, cooldown } = item.ranged!;
      expect(speed).toBeGreaterThan(120); // faster than the hero walks
      expect(range).toBeGreaterThan(7 * 32); // the Time Bolt flies 7 cells
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
