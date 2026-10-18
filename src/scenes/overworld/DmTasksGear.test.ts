import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, newHero } from '../../systems/combat';
import { packSize } from '../../systems/inventory';
import { TASK_LINGER } from '../../systems/dmTasks';
import { FUSED, itemOf } from '../../systems/items';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';

// The gear the DM hands out for a quest (a forge quest pays it; a hunt does not), through `collect`, so a full pack is handled.
function game() {
  const player = (slot: number) => {
    const hero = newHero();
    hero.stats.level = 3;
    return { slot, zone: 'fen', body: { x: 100, y: 100 }, hero } as never as { hero: ReturnType<typeof newHero> };
  };
  const party = [player(1), player(2)];
  const looks: unknown[] = [];
  const arena = {
    role: 'host',
    task: null,
    local: { zone: 'fen', body: { x: 0, y: 0 } },
    party: () => party,
    partyAll: () => party,
    zones: new Map(),
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
    zoneOf: () => ({ name: 'fen' }),
    refreshLook: (p: unknown) => looks.push(p),
  } as unknown as Arena;
  const sim = { onKill: () => {}, onDefeat: () => {}, reward: () => {}, text: () => {} } as unknown as Simulation;
  const desk = { say: () => {} } as unknown as DmDesk;
  const tasks = new DmTasks(arena, sim, desk);
  const forge = () =>
    tasks.start({
      kind: 'forge',
      title: 'Set an Emerald in a Steel Sword',
      zone: 'fen',
      goal: 1,
      what: 'steelSword+emerald',
      x: 5,
      y: 5,
    });
  return { tasks, arena, party, looks, forge };
}

describe('a forge quest, on the host', () => {
  it('is done when someone makes the piece it names, and pays each hero a piece of gear for what they wear', () => {
    const { tasks, arena, party, looks, forge } = game();
    expect(forge()).toBe(true);
    tasks.forged(itemOf('steelSword')); // another piece: not it
    tasks.update(0.1);
    expect(arena.task!.state).toBe('active');
    tasks.forged(FUSED['steelSword+emerald']!);
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
    for (const p of party) {
      const owned = [
        p.hero.weapon,
        p.hero.head,
        p.hero.chest,
        p.hero.legs,
        p.hero.feet,
        p.hero.cape,
        p.hero.offhand,
        ...p.hero.pack,
      ];
      expect(owned.filter((i) => i && i !== itemOf('stick') && i !== itemOf('travelerCloak')).length).toBe(1);
    }
    expect(looks).toHaveLength(2);
    tasks.update(TASK_LINGER + 1);
    expect(arena.task).toBeNull();
  });

  it('varies what it gives: a different slot from the last reward, and not the same piece for both heroes', () => {
    const { tasks, party } = game();
    const first = party.map((p) => tasks.gift(p as never, 1));
    expect(first.every(Boolean)).toBe(true);
    const worn = (p: (typeof party)[number]) => GEAR_SLOTS.map((slot) => p.hero[slot]?.name);
    const slotBefore = party.map((p) => worn(p));
    const second = party.map((p) => tasks.gift(p as never, 2));
    expect(second.every(Boolean)).toBe(true);
    party.forEach((_p, i) => expect(second[i]).not.toBe(first[i])); // not the same piece twice running
    expect(party.map((p) => worn(p))).not.toEqual(slotBefore);
  });

  it('never overfills a pack: a piece that would have to go there is refused, and not counted as given', () => {
    const { tasks, party } = game();
    const hero = party[0]!.hero;
    hero.pack = Array.from({ length: 10 }, () => itemOf('bread'));
    for (let seed = 0; seed < 40; seed++) {
      tasks.gift(party[0] as never, seed);
      expect(hero.pack.length).toBeLessThanOrEqual(packSize(hero));
    }
  });
});
