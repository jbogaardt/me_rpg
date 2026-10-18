import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTS, WHOLE_BODIES } from '../../sprites/parts';
import { SLOTS, outfitLayers, outfitParts, type Outfit, type PartManifest } from '../../src/sprites/doll';
import { MOB_KINDS } from '../../src/systems/combat';
import { itemOf } from '../../src/systems/items';
import { allPlayerOutfits, heroOutfit, HERO_BASE, NPC_LOOKS, PLAYER_BASES } from '../../src/systems/looks';
import { newHero } from '../../src/systems/combat';
import { ROOT } from '../map/image';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/sprites/lpc/parts.json'), 'utf8')) as PartManifest;

const outfits: [string, Outfit][] = [
  ...PLAYER_BASES.map((o, i): [string, Outfit] => [`player ${i} base`, o]),
  ...allPlayerOutfits().map((o, i): [string, Outfit] => [`player gear #${i}`, o]),
  ...Object.entries(NPC_LOOKS).map(([n, o]): [string, Outfit] => [`npc ${n}`, o]),
  ...Object.entries(MOB_KINDS).map(([n, k]): [string, Outfit] => [`mob ${n}`, k.look]),
];

describe('sprite parts', () => {
  it('names every part <slot>.<name> with a known slot', () => {
    for (const id of Object.keys(PARTS)) expect(SLOTS as readonly string[]).toContain(id.split('.')[0]);
  });

  it('has packed art for every catalog part (run `npm run sprites -- build` if not)', () => {
    for (const id of Object.keys(PARTS)) expect(manifest[id], id).toBeDefined();
  });

  it.each(outfits)('%s only uses real parts, each in its own slot', (_name, outfit) => {
    for (const [slot, id] of Object.entries(outfit)) {
      expect(manifest[id], `${slot}: ${id}`).toBeDefined();
      expect(id.startsWith(`${slot}.`), `${id} is not a ${slot} part`).toBe(true);
    }
    expect(outfitLayers(outfit, manifest).length).toBeGreaterThan(0);
  });

  it.each(outfits)('%s has a body and a head, so it is a whole character', (_name, outfit) => {
    expect(outfit.body).toBeDefined();
    if (!WHOLE_BODIES.has(outfit.body ?? '')) expect(outfit.head).toBeDefined(); // a whole body brings its head
  });

  it('draws the body behind the head and the head behind its hair', () => {
    const z = (id: string) => manifest[id]?.[0]?.z ?? -1;
    expect(z(HERO_BASE.body!)).toBeLessThan(z(HERO_BASE.head!));
    expect(z(HERO_BASE.head!)).toBeLessThan(z(HERO_BASE.hair!));
  });
});

describe('hero gear looks', () => {
  it('starts with a stick and no cloak, over the base clothes', () => {
    const o = heroOutfit(newHero());
    expect(o.weapon).toBe(itemOf('stick').look!.weapon);
    expect(o.cape).toBeUndefined();
    expect(o.torso).toBe(HERO_BASE.torso);
  });

  it('armor replaces base clothes in the slots it sets and leaves the rest', () => {
    const hero = newHero();
    hero.chest = itemOf('plateArmor');
    const o = heroOutfit(hero);
    expect(o.torso).toBe('torso.plate_steel');
    expect(o.hair).toBe(HERO_BASE.hair);
    expect(outfitParts(o)).not.toContain(HERO_BASE.torso);
  });
});
