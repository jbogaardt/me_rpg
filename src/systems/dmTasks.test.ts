import { describe, expect, it } from 'vitest';
import {
  DEFEND_AWAY,
  DEFEND_GOAL,
  FOLLOW_STILL,
  FOLLOW_TRAVEL,
  HUNT_GOAL,
  TASK_TIMEOUT,
  TaskBook,
  taskFromWire,
  taskReward,
  taskText,
  taskWire,
  viewOf,
  type Presence,
} from './dmTasks';

const at = (x: number, y = 0, zone = 'z'): Presence => ({ zone, x, y });

describe('follow me', () => {
  it('ends only once the DM has walked far, the party is round them, and they stand still', () => {
    const book = new TaskBook();
    expect(book.call('follow', at(0))).toBe(true);
    const party = [at(10), at(20)];
    // standing still at the start does nothing: they have not gone anywhere
    for (let i = 0; i < 100; i++) expect(book.tick(0.1, { dm: at(0), party, kills: 0 })).toBeNull();
    // the DM walks away and the party keeps up
    let x = 0;
    while (x < FOLLOW_TRAVEL + 50) {
      x += 8;
      expect(book.tick(0.1, { dm: at(x), party: [at(x - 20), at(x - 40)], kills: 0 })).toBeNull();
    }
    let result = null;
    for (let i = 0; i < FOLLOW_STILL * 10 + 2 && !result; i++)
      result = book.tick(0.1, { dm: at(x), party: [at(x - 20), at(x - 40)], kills: 0 });
    expect(result).toBe('done');
  });

  it('waits for a straggler', () => {
    const book = new TaskBook();
    book.call('follow', at(0));
    for (let x = 0; x < FOLLOW_TRAVEL + 50; x += 8) book.tick(0.1, { dm: at(x), party: [at(x)], kills: 0 });
    const x = FOLLOW_TRAVEL + 50;
    for (let i = 0; i < 100; i++)
      expect(book.tick(0.1, { dm: at(x), party: [at(x), at(x - 2000)], kills: 0 })).toBeNull(); // one far behind
    expect(book.task!.state).toBe('active');
  });
});

describe('defend this ground', () => {
  it('is held by standing on it for long enough', () => {
    const book = new TaskBook();
    book.call('defend', at(500, 500));
    let result = null;
    for (let t = 0; t < DEFEND_GOAL + 2 && !result; t += 0.5)
      result = book.tick(0.5, { dm: at(0), party: [at(520, 480)], kills: 0 });
    expect(result).toBe('done');
  });

  it('is lost when nobody is on it for too long, and stays on while someone is', () => {
    const book = new TaskBook();
    book.call('defend', at(500, 500));
    for (let t = 0; t < 10; t += 1) book.tick(1, { dm: at(0), party: [at(5000)], kills: 0 });
    book.tick(1, { dm: at(0), party: [at(500, 500)], kills: 0 }); // someone returns: the clock for "away" restarts
    expect(book.task!.away).toBe(0);
    let result = null;
    for (let t = 0; t < DEFEND_AWAY + 1 && !result; t += 1) result = book.tick(1, { dm: at(0), party: [], kills: 0 });
    expect(result).toBe('failed');
  });
});

describe('hunt here', () => {
  it('counts the kills in its zone', () => {
    const book = new TaskBook();
    book.call('hunt', at(0, 0, 'fen'));
    expect(book.tick(1, { dm: at(0, 0, 'fen'), party: [], kills: 2 })).toBeNull();
    expect(book.tick(1, { dm: at(0, 0, 'fen'), party: [], kills: 1 })).toBeNull();
    expect(book.task!.progress).toBe(3);
    expect(book.tick(1, { dm: at(0, 0, 'fen'), party: [], kills: HUNT_GOAL })).toBe('done');
    expect(book.task!.progress).toBe(HUNT_GOAL); // never beyond the goal
  });
});

describe('one at a time', () => {
  it('refuses a second call until the first is over or called off', () => {
    const book = new TaskBook();
    expect(book.call('hunt', at(0))).toBe(true);
    expect(book.call('defend', at(0))).toBe(false);
    book.cancel();
    expect(book.call('defend', at(0))).toBe(true);
  });

  it('gives up on a task nobody finishes', () => {
    const book = new TaskBook();
    book.call('hunt', at(0));
    expect(book.tick(TASK_TIMEOUT + 1, { dm: at(0), party: [], kills: 0 })).toBe('failed');
    expect(book.call('hunt', at(0))).toBe(true); // a finished task makes room
  });

  it('reports done and failed once, on the tick they happen', () => {
    const book = new TaskBook();
    book.call('hunt', at(0));
    expect(book.tick(1, { dm: at(0), party: [], kills: HUNT_GOAL })).toBe('done');
    expect(book.tick(1, { dm: at(0), party: [], kills: 1 })).toBeNull();
  });
});

describe('what the party sees', () => {
  it('round-trips a task through the wire and refuses nonsense', () => {
    const book = new TaskBook();
    book.call('defend', at(512.4, 99.6, 'the_fen'));
    book.tick(5.5, { dm: at(0), party: [at(512, 100, 'the_fen')], kills: 0 });
    const v = viewOf(book.task!);
    expect(v).toMatchObject({ kind: 'defend', state: 'active', progress: 5, goal: DEFEND_GOAL, x: 512, y: 100 });
    expect(taskFromWire(JSON.parse(JSON.stringify(taskWire(v))))).toEqual(v);
    for (const bad of [
      null,
      [],
      [9, 0, 0, 1, 'z', 0, 0],
      [0, 9, 0, 1, 'z', 0, 0],
      [0, 0, -1, 1, 'z', 0, 0],
      [0, 0, 0, 1, '', 0, 0],
      [0, 0, 0, 1, 'z', 0.5, 0],
      'x',
    ])
      expect(taskFromWire(bad)).toBeNull();
  });

  it('says what was asked, and pays more for the harder ones', () => {
    expect(taskText({ kind: 'follow', state: 'active', progress: 0, goal: 3, zone: 'z', x: 0, y: 0 })).toBe(
      'The DM calls: follow me',
    );
    expect(taskText({ kind: 'defend', state: 'active', progress: 12, goal: 60, zone: 'z', x: 0, y: 0 })).toContain(
      '12/60',
    );
    expect(taskText({ kind: 'hunt', state: 'done', progress: 5, goal: 5, zone: 'z', x: 0, y: 0 })).toContain('done');
    expect(taskReward('defend').xp).toBeGreaterThan(taskReward('follow').xp);
  });
});
