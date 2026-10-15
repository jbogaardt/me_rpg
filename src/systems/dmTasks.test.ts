import { describe, expect, it } from 'vitest';
import {
  TASK_TIMEOUT,
  TaskBook,
  VISIT_REACH,
  classify,
  parOf,
  taskFromWire,
  taskReward,
  taskText,
  taskWire,
  viewOf,
  type QuestOffer,
  type TaskInput,
} from './dmTasks';

const offer = (o: Partial<QuestOffer> = {}): QuestOffer => ({
  kind: 'hunt',
  title: 'Hunt 3 Goblins',
  zone: 'fen',
  goal: 3,
  what: 'goblin',
  x: 500,
  y: 500,
  ...o,
});
const input = (i: Partial<TaskInput> = {}): TaskInput => ({
  party: [],
  health: 1,
  falls: 0,
  ...i,
});

describe('hunting', () => {
  it('counts the kills of its foe, never beyond the goal, and ends when the last falls', () => {
    const b = new TaskBook();
    expect(b.call(offer())).toBe(true);
    b.kill('goblin', 'fen');
    expect(b.kill('goblin', 'fen')).toBe(true);
    expect(b.tick(1, input())).toBeNull();
    expect(b.task!.progress).toBe(2);
    expect(b.kill('wolf', 'fen')).toBe(false); // not its foe
    expect(b.kill('goblin', 'glen')).toBe(false); // not its land
    for (let i = 0; i < 5; i++) b.kill('goblin', 'fen');
    expect(b.tick(1, input())).toBe('done');
    expect(b.task!.progress).toBe(3);
    expect(b.kill('goblin', 'fen')).toBe(false); // done: nothing more counts
    expect(b.tick(1, input())).toBeNull(); // reported once
  });
});

describe('gathering', () => {
  it('counts each site once, however often it is touched', () => {
    const b = new TaskBook();
    b.call(offer({ kind: 'gather', goal: 3, what: 'echostone', title: 'Gather 3 Echostones' }));
    expect([b.touch('echostone', 'fen', 0), b.touch('echostone', 'fen', 0), b.touch('echostone', 'fen', 2)]).toEqual([
      true,
      false,
      true,
    ]);
    b.tick(1, input());
    expect(b.task!.progress).toBe(2);
    expect(b.touch('echostone', 'fen', 2)).toBe(false);
    expect(b.touch('moss', 'fen', 1)).toBe(false); // not its sites
    b.touch('echostone', 'fen', 1);
    expect(b.tick(1, input())).toBe('done');
    expect(b.task!.bits).toBe(0b111);
  });
});

describe('finding a relic', () => {
  it('ends when it is found', () => {
    const b = new TaskBook();
    b.call(offer({ kind: 'find', goal: 1, what: 'charm', title: 'Find the Charm' }));
    expect(b.tick(5, input())).toBeNull();
    expect(b.touch('relic', 'fen', 0)).toBe(true);
    expect(b.tick(1, input())).toBe('done');
  });
});

describe('reaching a place', () => {
  it('ends when someone of the party is there, in its zone', () => {
    const b = new TaskBook();
    b.call(offer({ kind: 'visit', goal: 1, what: 'Old Mill', title: 'Reach Old Mill', x: 100, y: 100 }));
    expect(b.tick(1, input({ party: [{ zone: 'elsewhere', x: 100, y: 100 }] }))).toBeNull();
    expect(b.tick(1, input({ party: [{ zone: 'fen', x: 100 + VISIT_REACH + 40, y: 100 }] }))).toBeNull();
    expect(b.tick(1, input({ party: [{ zone: 'fen', x: 100 + VISIT_REACH - 10, y: 100 }] }))).toBe('done');
  });
});

describe('how it goes', () => {
  it('follows the quarry, remembers the worst of the party’s health and the falls, and says how long since progress', () => {
    const b = new TaskBook();
    b.call(offer());
    b.tick(30, input({ at: { x: 10, y: 20 }, health: 0.5 }));
    b.tick(30, input({ health: 0.8, falls: 1 }));
    expect([b.task!.x, b.task!.y, b.task!.minHealth, b.task!.falls, b.task!.sinceProgress]).toEqual([
      10, 20, 0.5, 1, 60,
    ]);
    b.kill('goblin', 'fen');
    b.tick(1, input());
    expect(b.task!.sinceProgress).toBe(1); // the kill reset it, then a second passed
    b.tick(1, input({ at: { x: 0, y: 0 } }));
  });

  it('is told once the DM points the way, can be called off, and gives up in the end', () => {
    const b = new TaskBook();
    b.call(offer());
    expect(b.task!.hint).toBe(false);
    b.giveHint();
    expect(b.task!.hint).toBe(true);
    expect(b.call(offer())).toBe(false); // one at a time
    expect(b.tick(TASK_TIMEOUT + 1, input())).toBe('failed');
    expect(b.result).toMatchObject({ state: 'failed' });
    expect(b.call(offer())).toBe(true);
    b.cancel();
    expect(b.task).toBeNull();
  });

  it('sorts a finish: quick and unhurt, hard-won, or neither', () => {
    const r = (o: Partial<Parameters<typeof classify>[0]>) =>
      classify({ kind: 'hunt', state: 'done', elapsed: 100, minHealth: 0.9, falls: 0, par: 100, ...o });
    expect(r({ elapsed: 40 })).toBe('smooth');
    expect(r({ elapsed: 120 })).toBe('plain');
    expect(r({ falls: 1 })).toBe('rough');
    expect(r({ minHealth: 0.2, elapsed: 20 })).toBe('rough');
    expect(r({ state: 'failed', elapsed: 20 })).toBe('plain');
    expect(parOf('hunt', 5)).toBeGreaterThan(parOf('hunt', 3));
  });
});

describe('what the party sees', () => {
  it('round-trips a quest through the wire and refuses nonsense', () => {
    const b = new TaskBook();
    b.call(offer({ kind: 'gather', goal: 3, what: 'echostone', title: 'Gather 3 Echostones', x: 512.4, y: 99.6 }));
    b.touch('echostone', 'fen', 1);
    b.giveHint();
    const v = viewOf(b.task!);
    expect(v).toMatchObject({ kind: 'gather', progress: 1, goal: 3, x: 512, y: 100, bits: 2, hint: true });
    expect(taskFromWire(JSON.parse(JSON.stringify(taskWire(v))))).toEqual(v);
    const ok = taskWire(v);
    const broken: unknown[] = [
      null,
      [],
      'x',
      [...ok.slice(0, 10)],
      [9, ...ok.slice(1)],
      [ok[0], 9, ...ok.slice(2)],
      [...ok.slice(0, 7), '', ...ok.slice(8)],
      [...ok.slice(0, 7), 'x'.repeat(100), ...ok.slice(8)],
      [...ok.slice(0, 9), 2, ok[10]],
      [...ok.slice(0, 5), 0.5, ...ok.slice(6)],
    ];
    for (const bad of broken) expect(taskFromWire(bad)).toBeNull();
  });

  it('carries the DM’s instructions as a twelfth value, within their limit', () => {
    const b = new TaskBook();
    b.call(offer({}));
    const v = { ...viewOf(b.task!), note: 'Go north, past the mill.' };
    const wire = taskWire(v);
    expect(wire).toHaveLength(12);
    expect(taskFromWire(JSON.parse(JSON.stringify(wire)))).toEqual(v);
    expect(taskFromWire([...wire.slice(0, 11), 'x'.repeat(241)])).toBeNull();
    expect(taskWire(viewOf(b.task!))).toHaveLength(11);
  });

  it('carries a saga’s step as a thirteenth value, with an empty note when the DM wrote none', () => {
    const b = new TaskBook();
    b.call(offer({}));
    const v = { ...viewOf(b.task!), epic: { title: 'The Long Road', step: 2, total: 5 } };
    const wire = taskWire(v);
    expect(wire).toHaveLength(13);
    expect(wire[11]).toBe('');
    expect(taskFromWire(JSON.parse(JSON.stringify(wire)))).toEqual(v);
    for (const bad of ['2/5', '0/5 X', '6/5 X', 'x/5 X', '2/5 ' + 'x'.repeat(60)])
      expect(taskFromWire([...wire.slice(0, 12), bad])).toBeNull();
    expect(taskText(v)).toContain('The Long Road 2/5: ');
  });

  it('says what was asked and how it stands, and pays by the size of the ask', () => {
    const v = viewOf({
      ...new TaskBook().task!,
      ...(() => {
        const b = new TaskBook();
        b.call(offer());
        return b.task!;
      })(),
    });
    expect(taskText(v)).toBe('Hunt 3 Goblins (0/3)');
    expect(taskText({ ...v, goal: 1, title: 'Find the Charm' })).toBe('Find the Charm');
    expect(taskText({ ...v, state: 'done' })).toContain('done');
    expect(taskReward('hunt', 5).xp).toBeGreaterThan(taskReward('hunt', 3).xp);
    expect(taskReward('find', 1).xp).toBeGreaterThan(taskReward('visit', 1).xp);
  });
});
