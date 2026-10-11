import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../net/protocol';
import { newHero } from './combat';
import { ITEMS } from './items';
import {
  allPlayerOutfits,
  heroOutfit,
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
    hero.armor = ITEMS.plateArmor;
    hero.weapon = ITEMS.silverSword;
    for (const slot of [0, 1, 2, 3]) {
      const outfit = playerOutfit(slot, hero);
      expect(outfit.weapon).toBe('weapon.arming_silver');
      expect(outfit.torso).toBe('torso.plate_steel'); // armor replaces the base clothes...
      expect(outfit.hair).toBe(PLAYER_BASES[slot]?.hair); // ...and the player keeps their own face and hair
      expect(outfit.body).toBe(PLAYER_BASES[slot]?.body);
    }
  });

  it('keeps player 0 the original hero', () => {
    expect(heroOutfit(newHero())).toEqual(playerOutfit(0, newHero()));
  });

  it('refuses a player that does not exist', () => {
    expect(() => playerOutfit(4, newHero())).toThrow(/no player 4/);
    expect(() => playerOutfit(-1, newHero())).toThrow(/no player -1/);
  });

  it('lists every outfit up front so the game can load all the art before play', () => {
    const weapons = Object.values(ITEMS).filter((i) => i.slot === 'weapon').length;
    const armors = Object.values(ITEMS).filter((i) => i.slot === 'armor').length;
    expect(allPlayerOutfits()).toHaveLength(MAX_PLAYERS * weapons * armors);
  });
});
