import { describe, expect, it } from 'vitest';
import { RELIC_KIND } from '../../systems/dmQuests';
import { TASK_LINGER, type QuestOffer } from '../../systems/dmTasks';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';

function game(role: 'host' | 'solo' = 'host') {
  const player = (slot: number, x: number, hp = 50) =>
    ({ slot, zone: 'fen', body: { x, y: 100 }, hero: { stats: { hp, maxHp: 50, level: 3 } } }) as never;
  const party = [player(1, 100), player(2, 120)];
  const arena = {
    role,
    task: null,
    local: { zone: 'fen', body: { x: 0, y: 0 } },
    party: () => party,
    zones: new Map(),
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
    zoneOf: () => ({ name: 'fen' }),
  } as unknown as Arena;
  const paid: [unknown, number, number][] = [];
  const sim = {
    onKill: (_z: string, _k: string) => {},
    onDefeat: () => {},
    reward: (p: unknown, xp: number, gold: number) => paid.push([p, xp, gold]),
    text: () => {},
  } as unknown as Simulation;
  const said: string[] = [];
  const desk = { say: (t: string) => said.push(t) } as unknown as DmDesk;
  const tasks = new DmTasks(arena, sim, desk);
  const offer = (o: Partial<QuestOffer> = {}): QuestOffer => ({
    kind: 'hunt',
    title: 'Hunt 2 Goblins',
    zone: 'fen',
    goal: 2,
    what: 'goblin',
    x: 500,
    y: 500,
    ...o,
  });
  const give = (o: Partial<QuestOffer> = {}) => {
    tasks.offers = [offer(o)];
    return tasks.call(0);
  };
  return { tasks, arena, sim, party, paid, said, give };
}

describe('the DM’s quest, on the host', () => {
  it('a quest given is announced and shown to everyone, one at a time', () => {
    const { tasks, arena, said, give } = game();
    expect(give()).toBe(true);
    expect(arena.task).toMatchObject({ kind: 'hunt', title: 'Hunt 2 Goblins', state: 'active', progress: 0, goal: 2 });
    expect(said).toHaveLength(1);
    expect(give()).toBe(false);
    expect(tasks.pace).toMatchObject({ age: 0, hint: false });
  });

  it('counts only the kills of its foe in its zone, pays the whole party, and says well done', () => {
    const { tasks, sim, arena, party, paid, said, give } = game();
    give();
    sim.onKill('elsewhere', 'goblin');
    sim.onKill('fen', 'wolf');
    tasks.update(0.1);
    expect(arena.task!.progress).toBe(0);
    sim.onKill('fen', 'goblin');
    sim.onKill('fen', 'goblin');
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
    expect(paid.map(([p]) => p)).toEqual(party);
    expect(paid[0]![1]).toBeGreaterThan(0);
    expect(said.at(-1)).toBe('Well done.');
    expect(tasks.result).toMatchObject({ kind: 'hunt', state: 'done' });
    tasks.update(TASK_LINGER + 1);
    expect(arena.task).toBeNull();
  });

  it('counts a gathered site once, for the party, and a relic found ends a find quest', () => {
    const { tasks, arena, party, give } = game();
    give({ kind: 'gather', title: 'Gather 2 Stones', what: 'echostone' });
    expect(tasks.touchSite(party[0]!, 'echostone', 0)).toBe(true);
    expect(tasks.touchSite(party[1]!, 'echostone', 0)).toBe(false); // the same site again
    expect(tasks.touchSite(party[1]!, 'mushroom', 1)).toBe(false); // not what was asked
    tasks.update(0.1);
    expect(arena.task).toMatchObject({ progress: 1, bits: 1 });
    expect(tasks.touchSite(party[1]!, 'echostone', 1)).toBe(true);
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
    tasks.update(TASK_LINGER + 1);
    give({ kind: 'find', goal: 1, title: 'Find the Charm', what: 'nothing' });
    expect(tasks.touchSite(party[0]!, RELIC_KIND, 0)).toBe(true);
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
  });

  it('remembers how hurt the party got and who fell, for the director', () => {
    const { tasks, party, sim, give } = game();
    give();
    (party[0] as unknown as { hero: { stats: { hp: number } } }).hero.stats.hp = 10;
    sim.onDefeat(party[0]!, 'fen', 0, 0);
    tasks.update(1);
    for (let i = 0; i < 2; i++) sim.onKill('fen', 'goblin');
    tasks.update(1);
    expect(tasks.result).toMatchObject({ falls: 1 });
    expect(tasks.result!.minHealth).toBeCloseTo(0.2);
  });

  it('can be pointed at the way, called off, and does nothing for a player who is not hosting', () => {
    const { tasks, arena, give } = game();
    give();
    tasks.giveHint();
    expect(arena.task!.hint).toBe(true);
    tasks.cancel();
    expect(arena.task).toBeNull();
    const solo = game('solo');
    expect(solo.give()).toBe(false);
    expect(solo.arena.task).toBeNull();
  });
});
