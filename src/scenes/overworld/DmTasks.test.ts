import { describe, expect, it } from 'vitest';
import { DEFEND_GOAL, HUNT_GOAL, TASK_LINGER } from '../../systems/dmTasks';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';

function fakeMob() {
  return {
    alive: true,
    beckoned: null as null | [number, number, number],
    beckon(x: number, y: number, s: number) {
      this.beckoned = [x, y, s];
    },
  };
}

function game(role: 'host' | 'solo' = 'host') {
  const mobs = [fakeMob(), fakeMob()];
  const player = (x: number, y: number) => ({ zone: 'fen', body: { x, y } });
  const dm = player(100, 100);
  const party = [player(110, 100), player(120, 100)];
  const arena = {
    role,
    task: null,
    view: { name: 'fen' },
    local: dm,
    get mobs() {
      return mobs;
    },
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
    party: () => party,
  } as unknown as Arena;
  const paid: [unknown, number, number][] = [];
  const sim = {
    onKill: (_z: string) => {},
    reward: (p: unknown, xp: number, gold: number) => paid.push([p, xp, gold]),
  } as unknown as Simulation;
  const said: string[] = [];
  const desk = { say: (t: string) => said.push(t) } as unknown as DmDesk;
  return { tasks: new DmTasks(arena, sim, desk), arena, sim, mobs, party, paid, said };
}

describe('the DM’s tasks, on the host', () => {
  it('a called task is anchored where the DM stands, announced, and shown to everyone', () => {
    const { tasks, arena, said } = game();
    expect(tasks.call('hunt')).toBe(true);
    expect(arena.task).toMatchObject({ kind: 'hunt', state: 'active', zone: 'fen', x: 100, y: 100, progress: 0 });
    expect(said).toEqual(['Hunt them down!']);
    expect(tasks.call('defend')).toBe(false); // one at a time
  });

  it('counts the party’s kills in its zone and pays everyone when the hunt is done', () => {
    const { tasks, sim, arena, party, paid, said } = game();
    tasks.call('hunt');
    sim.onKill('elsewhere'); // not in the task's zone
    tasks.update(0.1);
    expect(arena.task!.progress).toBe(0);
    for (let i = 0; i < HUNT_GOAL; i++) sim.onKill('fen');
    tasks.update(0.1);
    expect(arena.task!.state).toBe('done');
    expect(paid.map(([p]) => p)).toEqual(party);
    expect(paid[0]![1]).toBeGreaterThan(0);
    expect(said.at(-1)).toContain('Well done');
    tasks.update(TASK_LINGER + 1); // the result stays up a few seconds, then goes
    expect(arena.task).toBeNull();
  });

  it('a defended ground calls the foes towards it, and is held by standing on it', () => {
    const { tasks, mobs, arena } = game();
    tasks.call('defend');
    expect(mobs.every((m) => m.beckoned?.[0] === 100 && m.beckoned[1] === 100)).toBe(true);
    for (let t = 0; t < DEFEND_GOAL + 1; t++) tasks.update(1);
    expect(arena.task!.state).toBe('done');
  });

  it('can be called off, and does nothing for a player who is not hosting', () => {
    const { tasks, arena } = game();
    tasks.call('follow');
    tasks.cancel();
    expect(arena.task).toBeNull();
    const solo = game('solo');
    expect(solo.tasks.call('hunt')).toBe(false);
    expect(solo.arena.task).toBeNull();
  });
});
