import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../net/protocol';
import { outfitParts } from '../sprites/doll';
import { newHero } from './combat';
import { ITEMS } from './items';
import {
  allPlayerOutfits,
  heroOutfit,
  HERO_BASE,
  PLAYER_BASES,
  PLAYER_COLORS,
  playerName,
  playerOutfit,
  playerTag,
} from './looks';

describe('player looks', () => {
  it('has a look, a ring colour and a name for every player a game can hold', () => {
    expect(PLAYER_BASES).toHaveLength(MAX_PLAYERS);
    expect(PLAYER_COLORS).toHaveLength(MAX_PLAYERS);
  });

  it('makes every player tell-apart-able: different clothes, different ring colour', () => {
    expect(new Set(PLAYER_COLORS).size).toBe(MAX_PLAYERS);
    const looks = PLAYER_BASES.map((base) => JSON.stringify(base));
    expect(new Set(looks).size).toBe(MAX_PLAYERS);
    const torsos = PLAYER_BASES.map((base) => base.torso);
    expect(new Set(torsos).size).toBe(MAX_PLAYERS);
  });

  it('names players from 1, tagging them P1 to P4', () => {
    expect([0, 1, 2, 3].map(playerName)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
    expect([0, 1, 2, 3].map(playerTag)).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  it('lays each player’s gear over their own clothes', () => {
    const hero = newHero();
    hero.chest = ITEMS.plateArmor;
    hero.weapon = ITEMS.silverSword;
    for (const slot of [0, 1, 2, 3]) {
      const outfit = playerOutfit(slot, hero);
      expect(outfit.weapon).toBe('weapon.arming_silver');
      expect(outfit.torso).toBe('torso.plate_steel'); // armor replaces the base clothes...
      expect(outfit.hair).toBe(PLAYER_BASES[slot]?.hair); // ...and the player keeps their own face and hair
      expect(outfit.body).toBe(PLAYER_BASES[slot]?.body);
    }
  });

  it('draws every slot of gear at once: armor over the clothes, a shield in the off-hand, a bow in the hand', () => {
    const hero = newHero();
    Object.assign(hero, {
      weapon: ITEMS.greatBow,
      offhand: ITEMS.parryingDagger,
      head: ITEMS.greatHelm,
      chest: ITEMS.plateArmor,
      legs: ITEMS.steelGreaves,
      feet: ITEMS.steelBoots,
    });
    const o = heroOutfit(hero);
    expect(o).toMatchObject({
      weapon: 'weapon.bow_great',
      shield: 'shield.dagger_left',
      headwear: 'headwear.greathelm',
      torso: 'torso.plate_steel',
      legs: 'legs.plate_steel',
      feet: 'feet.plate_steel',
      cape: 'cape.maroon',
    });
    expect(o.hair).toBe(HERO_BASE.hair);
  });

  it('shows the base clothes where nothing is worn', () => {
    const hero = newHero();
    expect(heroOutfit(hero)).toMatchObject({ torso: HERO_BASE.torso, legs: HERO_BASE.legs, feet: HERO_BASE.feet });
    expect(heroOutfit(hero).headwear).toBeUndefined();
  });

  it('keeps player 0 the original hero', () => {
    expect(heroOutfit(newHero())).toEqual(playerOutfit(0, newHero()));
  });

  it('refuses a player that does not exist', () => {
    expect(() => playerOutfit(4, newHero())).toThrow(/no player 4/);
    expect(() => playerOutfit(-1, newHero())).toThrow(/no player -1/);
  });

  it('lists every item on every player up front so the game can load all the art before play', () => {
    expect(allPlayerOutfits()).toHaveLength(MAX_PLAYERS * Object.keys(ITEMS).length);
    const parts = new Set(allPlayerOutfits().flatMap(outfitParts));
    for (const item of Object.values(ITEMS)) for (const id of Object.values(item.look)) expect(parts).toContain(id);
  });
});
