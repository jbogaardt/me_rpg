import { describe, expect, it } from 'vitest';
import type { Mob } from '../../entities/Mob';
import { FREEZE_TIME } from '../../systems/dmPowers';
import type { Arena } from './Arena';
import { DmPowers } from './DmPowers';
import type { Simulation } from './Simulation';

function fakeMob(x: number, y: number) {
  const mob = {
    body: { x, y },
    hp: 10,
    alive: true,
    frozen: 0,
    resets: 0,
    beckoned: null as null | [number, number, number],
    beckon(x: number, y: number, seconds: number) {
      mob.beckoned = [x, y, seconds];
    },
    hit() {
      mob.alive = false;
      return true;
    },
    freeze(s: number) {
      mob.frozen = s;
    },
    reset() {
      mob.alive = true;
      mob.resets++;
    },
  };
  return mob;
}

function world(role: 'host' | 'solo' = 'host') {
  const mobs = [fakeMob(0, 0), fakeMob(100, 0), fakeMob(200, 50)];
  const zone = { name: 'z' };
  const arena = {
    role,
    view: zone,
    pressure: 'steady',
    timeStopped: false,
    get mobs() {
      return mobs;
    },
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
  } as unknown as Arena;
  const bolts: { harmless: boolean }[] = [];
  const fx: string[] = [];
  const sim = {
    lightning: (_s: unknown, harmless: boolean) => bolts.push({ harmless }),
    fx: (name: string) => fx.push(name),
    text: () => {},
  } as unknown as Simulation;
  return { powers: new DmPowers(arena, sim), arena, mobs, bolts, fx };
}

describe('the Dungeon Master’s powers', () => {
  it('smite fells every living foe with harmless bolts, and the DM never waits to do it again', () => {
    const { powers, mobs, bolts } = world();
    expect(powers.smite()).toBe(true);
    expect(powers.smite()).toBe(false); // the storm is still running
    for (let i = 0; i < 40; i++) powers.update(0.1);
    expect(mobs.every((m) => !m.alive)).toBe(true);
    expect(bolts.length).toBeGreaterThanOrEqual(mobs.length);
    expect(bolts.every((b) => b.harmless)).toBe(true);
    expect(powers.view().smite).toBe(0); // no cooldown
    expect(powers.smite()).toBe(false); // nobody left to strike
  });

  it('freezes every living foe for a while, as often as the DM likes', () => {
    const { powers, mobs } = world();
    expect(powers.freeze()).toBe(true);
    expect(mobs.every((m) => m.frozen === FREEZE_TIME)).toBe(true);
    expect(powers.freeze()).toBe(true);
  });

  it('stops and restarts time, and a reset gives it back', () => {
    const { powers, arena } = world();
    expect(powers.toggleStop()).toBe(true);
    expect(arena.timeStopped).toBe(true);
    expect(powers.view().stopped).toBe(true);
    powers.toggleStop();
    expect(arena.timeStopped).toBe(false);
    powers.toggleStop();
    powers.reset();
    expect(arena.timeStopped).toBe(false);
  });

  it('resets the zone: every foe, the fallen too, back home', () => {
    const { powers, mobs } = world();
    mobs[0]!.alive = false;
    expect(powers.resetZone()).toBe(true);
    expect(mobs.map((m) => m.resets)).toEqual([1, 1, 1]);
    expect(mobs.every((m) => m.alive)).toBe(true);
    expect(powers.resetZone()).toBe(true); // no cooldown
  });

  it('sets the pressure', () => {
    const { powers, arena } = world();
    powers.setPressure('fierce');
    expect(arena.pressure).toBe('fierce');
    expect(powers.view().pressure).toBe('fierce');
  });

  it('does nothing for a player who is not hosting', () => {
    const { powers, arena, mobs } = world('solo');
    expect(powers.smite()).toBe(false);
    expect(powers.freeze()).toBe(false);
    expect(powers.toggleStop()).toBe(false);
    expect(powers.resetZone()).toBe(false);
    expect(arena.timeStopped).toBe(false);
    expect(mobs.every((m) => m.alive && m.frozen === 0)).toBe(true);
  });
});

// A type-only use so the fake stays honest about what a mob offers.
const _check: Pick<Mob, 'alive'> = { alive: true };
void _check;

describe('the director’s two moves', () => {
  it('turning up the heat makes the world fierce and calls the foes towards the party', () => {
    const { powers, arena, mobs } = world();
    (arena as unknown as { party: () => unknown[] }).party = () => [
      { zone: 'z', body: { x: 40, y: 60 }, hero: { stats: {} } },
    ];
    powers.heat();
    expect(arena.pressure).toBe('fierce');
    expect(mobs.every((m) => m.beckoned?.[0] === 40 && m.beckoned[1] === 60)).toBe(true);
  });

  it('easing off makes the world gentle and gives the hurt party a third of their health back', () => {
    const { powers, arena } = world();
    const hurt = { slot: 1, zone: 'z', body: { x: 0, y: 0 }, hero: { stats: { hp: 10, maxHp: 90 } } };
    const whole = { slot: 2, zone: 'z', body: { x: 0, y: 0 }, hero: { stats: { hp: 50, maxHp: 50 } } };
    Object.assign(arena, { partyAll: () => [hurt, whole], zoneOf: () => ({ name: 'z' }) });
    powers.easeOff();
    expect(arena.pressure).toBe('gentle');
    expect(hurt.hero.stats.hp).toBe(40);
    expect(whole.hero.stats.hp).toBe(50);
  });
});
