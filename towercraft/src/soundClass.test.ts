import { describe, expect, it } from 'vitest';
import { RACE_IDS, RACES } from './sim/races';
import { BOARD_IDS } from './sim/board';
import { BANK } from './soundBank';
import {
  CASTLE_WEAPON,
  deathKind,
  impactKind,
  isStone,
  kindsForMatch,
  STONE_HP,
  themeOf,
  THEMES,
  TOWER_WEAPON,
  UNIT_DEATH,
  UNIT_WEAPON,
} from './soundClass';
import { PLAYLISTS } from './playlist';

describe('what each unit and tower sounds like', () => {
  it('gives every unit a weapon (or none, for a bomb) and a death, and names no unit that does not exist', () => {
    for (const id of RACE_IDS) {
      const units = RACES[id].units.map((u) => u.id).sort();
      expect(Object.keys(UNIT_WEAPON[id]).sort(), id).toEqual(units);
      expect(Object.keys(UNIT_DEATH[id]).sort(), id).toEqual(units);
      for (const u of RACES[id].units) {
        const w = UNIT_WEAPON[id][u.id];
        expect(w === null ? u.suicide : BANK[w!].group, `${id}/${u.id}`).toBeTruthy();
        if (u.suicide) expect(w, `${id}/${u.id} blows up: its death is its sound`).toBeNull();
        else expect(w, `${id}/${u.id}`).not.toBeNull();
      }
    }
  });

  it('puts the right sound on the right style of attacker', () => {
    for (const id of RACE_IDS)
      for (const u of RACES[id].units) {
        const w = UNIT_WEAPON[id][u.id];
        if (u.air && !u.suicide) expect(['bat', 'gryphon'], `${id}/${u.id}`).toContain(w);
        if (u.range > 3 && !u.air) expect(['bow', 'gun', 'catapult']).toContain(w);
        if (u.multi && u.range < 2 && id !== 'titan') expect(w).toBe('sword');
        expect(deathKind(id, u) === 'deathflyer', `${id}/${u.id}`).toBe(!!u.air);
      }
    expect(UNIT_WEAPON.titan.runesmith).toBe('flame');
    expect(UNIT_WEAPON.legion.ram).toBe('catapult');
  });

  it('gives every tower that attacks a weapon, and a silent one to every building that does not', () => {
    for (const id of RACE_IDS) {
      expect(Object.keys(TOWER_WEAPON[id]).sort(), id).toEqual(RACES[id].towers.map((t) => t.id).sort());
      for (const t of RACES[id].towers) {
        const w = TOWER_WEAPON[id][t.id];
        if (t.damage > 0 || t.bunker) expect(w, `${id}/${t.id}`).toBeTruthy();
        else expect(w, `${id}/${t.id}`).toBeNull();
      }
    }
    expect(CASTLE_WEAPON).toBe('bow');
    expect(TOWER_WEAPON.titan.cannon).toBe('cannon');
    expect(TOWER_WEAPON.titan.ballista).toBe('ballista');
  });

  it('lands a missile by its weapon and by what it hits', () => {
    expect(impactKind('bow', 'stone')).toBe('arrowhit');
    expect(impactKind('catapult', 'stone')).toBe('hitstone');
    expect(impactKind('catapult', 'wood')).toBe('hitwood');
    expect(impactKind('catapult', undefined)).toBe('hitstone');
    expect(impactKind('ballista', 'wood')).toBe('hitwood');
    expect(impactKind('ballista', undefined)).toBe('arrowhit');
    expect(impactKind('cannon', undefined)).toBe('blast');
    expect(impactKind('sword', undefined)).toBeNull();
  });

  it('calls dwarves’ buildings stone and big buildings of the others stone too', () => {
    expect(isStone('titan', 100)).toBe(true);
    expect(isStone('swarm', STONE_HP - 1)).toBe(false);
    expect(isStone('legion', STONE_HP)).toBe(true);
  });
});

describe('themes and loading', () => {
  it('gives every map a theme with a rotation of battle music, co-op maps the theme of their look', () => {
    for (const id of BOARD_IDS) expect(THEMES, id).toContain(themeOf(id));
    for (const t of THEMES) expect(PLAYLISTS[t].length, t).toBeGreaterThanOrEqual(3);
    expect(themeOf('crossroads')).toBe('greenwood');
    expect(themeOf('delta')).toBe('ember');
    expect(themeOf('nowhere')).toBe('greenwood');
  });

  it('loads only what the races in a match use', () => {
    const goblins = kindsForMatch(['swarm', 'swarm']);
    expect(goblins).toContain('deathgoblin');
    expect(goblins).toContain('spear');
    expect(goblins).not.toContain('deathdwarf');
    expect(goblins).not.toContain('cannon');
    expect(kindsForMatch(['titan', 'legion'])).toEqual(
      expect.arrayContaining(['cannon', 'flame', 'deathbeast', 'catapult']),
    );
    expect(goblins).not.toContain('click');
  });
});
