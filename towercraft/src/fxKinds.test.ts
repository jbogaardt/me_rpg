import { describe, expect, it } from 'vitest';
import { RACES, RACE_IDS } from './sim/races';
import { MISSILES, cellOf, frameAt, impactFor, lobSize, missileFor } from './fxKinds';

describe('what fires what', () => {
  it('gives every tower and ranged unit a missile that suits it', () => {
    const t = (art: string, splash = 0) => missileFor({ kind: 'tower', art }, splash);
    expect(t('dwarf_ballista_tower')).toBe('bolt');
    expect(t('dwarf_cannon_tower', 1)).toBe('cannon');
    expect(t('goblin_cannon_tower')).toBe('cannon');
    expect(t('teuton_catapult_tower', 0.8)).toBe('rock');
    expect(t('goblin_guard_tower', 1)).toBe('slime');
    expect(t('goblin_watch_tower')).toBe('goblin_arrow');
    expect(t('teuton_watch_tower')).toBe('arrow');
    expect(missileFor({ kind: 'castle' }, 0)).toBe('bolt');
    expect(missileFor({ kind: 'unit', sheet: 'goblin_archer' }, 0)).toBe('goblin_arrow');
    expect(missileFor({ kind: 'unit', sheet: 'germanic_archer' }, 0)).toBe('arrow');
    expect(missileFor({ kind: 'unit', sheet: 'thunderer' }, 0)).toBe('bullet');
    expect(missileFor({ kind: 'unit', sheet: 'catapult' }, 1.2)).toBe('rock');
    expect(missileFor(undefined, 0)).toBe('arrow');
  });

  it('every tower of every race maps to a known missile', () => {
    for (const id of RACE_IDS)
      for (const tw of RACES[id].towers)
        expect(MISSILES[missileFor({ kind: 'tower', art: tw.art }, tw.splash)]).toBeDefined();
  });

  it('lobbed shots grow with height; the sheet frame holds its last', () => {
    expect(lobSize(0)).toBe(0);
    expect(lobSize(0.5)).toBe(2);
    expect(lobSize(1)).toBe(0);
    expect(frameAt(10, 0, 1)).toBe(0);
    expect(frameAt(10, 0.55, 1)).toBe(5);
    expect(frameAt(10, 5, 1)).toBe(9);
    expect(cellOf(7, 5, 48)).toEqual([96, 48]);
  });

  it('a blast needs an impact; a plain hit a puff', () => {
    expect(impactFor('arrow', 0)).toBe('puff');
    expect(impactFor('arrow', 1)).toBe('impact');
    expect(impactFor('cannon', 1)).toBe('explosion');
  });
});
