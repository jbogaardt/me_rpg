import { describe, expect, it } from 'vitest';
import { DONE_WORDS } from '../../systems/dmVoice';
import { RELIC_KIND } from '../../systems/dmQuests';
import { TASK_LINGER, taskReward, type QuestOffer } from '../../systems/dmTasks';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';

function game(role: 'host' | 'solo' | 'client' = 'host') {
  const player = (slot: number, x: number, hp = 50) =>
    ({ slot, zone: 'fen', body: { x, y: 100 }, hero: { stats: { hp, maxHp: 50, level: 3 } } }) as never;
  const party = [player(1, 100), player(2, 120)];
  const arena = {
    role,
    task: null,
    local: { zone: 'fen', body: { x: 0, y: 0 } },
    party: () => party,
    partyAll: () => party,
    zones: new Map(),
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
    zoneOf: () => ({ name: 'fen' }),
  } as unknown as Arena;
  const paid: [unknown, number, number][] = [];
  const sim = {
    onKill: (_z: string, _k: string) => {},
    onCast: (_p: unknown, _z: string, _s: string) => {},
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
    return tasks.start(offer(o));
  };
  return { tasks, arena, sim, party, paid, said, give };
}

describe('the DM’s quest, on the host', () => {
  it('a quest given is shown to everyone (each screen tells it itself), one at a time', () => {
    const { tasks, arena, said, give } = game();
    expect(give()).toBe(true);
    expect(arena.task).toMatchObject({ kind: 'hunt', title: 'Hunt 2 Goblins', state: 'active', progress: 0, goal: 2 });
    expect(said).toHaveLength(0);
    expect(give()).toBe(false);
    expect(tasks.pace).toMatchObject({ age: 0, hint: 0 });
  });

  it('carries the DM’s own instructions for the running quest, and drops them when it ends', () => {
    const { tasks, arena, give } = game();
    expect(tasks.setNote('Go north.')).toBe(false); // nothing running yet
    give();
    expect(tasks.setNote('  Go\n north, past the mill.  ')).toBe(true);
    expect(arena.task!.note).toBe('Go north, past the mill.');
    expect(tasks.setNote('   ')).toBe(false);
    tasks.cancel();
    expect(arena.task).toBeNull();
    give();
    expect(arena.task!.note).toBeUndefined();
  });

  it('follows the whole party, even when the DM stands in another land', () => {
    const { tasks, arena, give } = game();
    (arena as unknown as { party: () => unknown[] }).party = () => []; // nobody in the DM's own land
    give({ kind: 'visit', title: 'Reach the Mill', zone: 'fen', goal: 1, what: 'The Mill', x: 100, y: 100 });
    tasks.update(0.1); // the party (in the fen) stands at the place
    expect(arena.task!.state).toBe('done');
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
    expect(DONE_WORDS).toContain(said.at(-1));
    expect(tasks.result).toMatchObject({ kind: 'hunt', state: 'done' });
    tasks.update(TASK_LINGER + 1);
    expect(arena.task).toBeNull();
  });

  it('counts a boss quest by the boss’s death alone, keeps the compass on it, and pays richly', () => {
    const { tasks, arena, sim, party, paid, give } = game();
    const boss = { alive: true, kind: { boss: true }, body: { x: 700, y: 800 } };
    const goblin = { alive: true, kind: { boss: false }, body: { x: 10, y: 10 } };
    arena.zones.set('fen', { name: 'fen' } as never);
    (arena as unknown as { mobs: unknown[] }).mobs = [goblin, boss];
    give({ kind: 'boss', title: 'Slay the Hollow Goblin King', goal: 1, what: 'goblin:480', level: 3 });
    tasks.update(0.1);
    expect(arena.task).toMatchObject({ kind: 'boss', x: 700, y: 800 }); // the compass points at it, not at a goblin
    boss.body.x = 650;
    tasks.update(2.5);
    expect(arena.task).toMatchObject({ x: 650, y: 800 }); // and follows it
    sim.onKill('fen', 'goblin'); // the ordinary goblin falls: not the boss
    tasks.update(0.1);
    expect(arena.task!.progress).toBe(0);
    boss.alive = false;
    sim.onKill('fen', 'boss');
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
    expect(paid.map(([p]) => p)).toEqual(party);
    expect(paid[0]![1]).toBeGreaterThan(taskReward('hunt', 5, 3).xp); // richer than a hunt of five
  });

  it('counts a mastery only for the spell it names, whoever casts it', () => {
    const { tasks, arena, sim, party, give } = game();
    give({ kind: 'master', title: 'Master Arcane Bolt: cast it 2 times', goal: 2, what: 'bolt:uurl' });
    sim.onCast(party[0]!, 'fen', 'nova');
    sim.onCast(party[0]!, 'fen', 'bolt');
    sim.onCast(party[1]!, 'glen', 'bolt'); // another land
    tasks.update(0.1);
    expect(arena.task).toMatchObject({ kind: 'master', progress: 1 });
    sim.onCast(party[1]!, 'fen', 'bolt');
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
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

  it('can be pointed at the way, called off, and does nothing for a friend (a guest only draws)', () => {
    const { tasks, arena, give } = game();
    give();
    tasks.giveHint();
    expect(arena.task!.hint).toBe(1);
    tasks.cancel();
    expect(arena.task).toBeNull();
    const friend = game('client');
    expect(friend.give()).toBe(false);
    expect(friend.arena.task).toBeNull();
    expect(game('solo').give()).toBe(true); // a solo player is their own host
  });
});
