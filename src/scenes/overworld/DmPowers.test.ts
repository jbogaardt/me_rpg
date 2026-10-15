import { describe, expect, it } from 'vitest';
import type { Mob } from '../../entities/Mob';
import { FREEZE_COOLDOWN, FREEZE_TIME, SMITE_COOLDOWN } from '../../systems/dmPowers';
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
  } as unknown as Simulation;
  return { powers: new DmPowers(arena, sim), arena, mobs, bolts, fx };
}

describe('the Dungeon Master’s powers', () => {
  it('smite fells every living foe with harmless bolts, then cools down', () => {
    const { powers, mobs, bolts } = world();
    expect(powers.smite()).toBe(true);
    expect(powers.smite()).toBe(false); // the storm is still running
    for (let i = 0; i < 40; i++) powers.update(0.1);
    expect(mobs.every((m) => !m.alive)).toBe(true);
    expect(bolts.length).toBeGreaterThanOrEqual(mobs.length);
    expect(bolts.every((b) => b.harmless)).toBe(true);
    expect(powers.view().smite).toBeGreaterThan(0);
    expect(powers.smite()).toBe(false); // nobody left, and cooling down
    powers.update(SMITE_COOLDOWN);
    expect(powers.view().smite).toBe(0);
  });

  it('freezes every living foe for a while, with its own cooldown', () => {
    const { powers, mobs } = world();
    expect(powers.freeze()).toBe(true);
    expect(mobs.every((m) => m.frozen === FREEZE_TIME)).toBe(true);
    expect(powers.freeze()).toBe(false);
    powers.update(FREEZE_COOLDOWN);
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

  it('resets the zone: every foe, the fallen too, back home; once in a while', () => {
    const { powers, mobs } = world();
    mobs[0]!.alive = false;
    expect(powers.resetZone()).toBe(true);
    expect(mobs.map((m) => m.resets)).toEqual([1, 1, 1]);
    expect(mobs.every((m) => m.alive)).toBe(true);
    expect(powers.resetZone()).toBe(false);
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
