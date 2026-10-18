import { describe, expect, it } from 'vitest';
import { bossMends, isNamedBoss, taskWantsBoss } from './bosses';

describe('named bosses', () => {
  it('are told from the kinds of the content by their flag', () => {
    expect(isNamedBoss({ named: true })).toBe(true);
    expect(isNamedBoss({})).toBe(false);
  });

  it('mend only when hurt, alive, and nobody is left to fight them', () => {
    const hurt = { named: true, alive: true, hp: 40, maxHp: 240 };
    expect(bossMends(hurt, 0)).toBe(true);
    expect(bossMends(hurt, 1)).toBe(false); // someone is still fighting it
    expect(bossMends({ ...hurt, hp: 240 }, 0)).toBe(false); // nothing to mend
    expect(bossMends({ ...hurt, alive: false }, 0)).toBe(false); // a fallen boss stays fallen
    expect(bossMends({ ...hurt, named: false }, 0)).toBe(false); // an ordinary foe is not mended
  });
});

describe('boss gating by a saga step', () => {
  const task = { kind: 'hunt', state: 'active', what: 'ashmaw', zone: 'cave', progress: 0, goal: 1 } as const;
  it('asks for the boss only while its hunt runs unfought, in its zone', () => {
    expect(taskWantsBoss(task, 'ashmaw', 'cave')).toBe(true);
    expect(taskWantsBoss(task, 'ashmaw', 'town')).toBe(false);
    expect(taskWantsBoss(task, 'hoarfather', 'cave')).toBe(false);
    expect(taskWantsBoss({ ...task, progress: 1 }, 'ashmaw', 'cave')).toBe(false);
    expect(taskWantsBoss({ ...task, state: 'done' }, 'ashmaw', 'cave')).toBe(false);
    expect(taskWantsBoss(null, 'ashmaw', 'cave')).toBe(false);
  });
});
