import { beforeAll, describe, expect, it } from 'vitest';
import type { ContentManager } from '../../content/ContentManager';
import { TASK_LINGER } from '../../systems/dmTasks';
import { setPlaces } from '../../systems/places';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmEpics } from './DmEpics';
import { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';
import type { Zones } from './Zones';

/** Two open lands, a and b, and a shop off a; a has a place to reach, b has none, and the party stands at the place. */
function game(far = false) {
  setPlaces({ a: 'The Glen', b: 'The Fen', shop: 'Shop' }, { a: ['b', 'shop'] }, {});
  const zone = (name: string, places: { name: string; col: number; row: number }[]) =>
    ({
      name,
      sites: [],
      data: { width: 100, height: 100, places, spawn: { col: 3, row: 3 } },
      collision: { fitsMap: () => true },
    }) as never;
  const a = zone('a', [{ name: 'The Old Mill', col: 10, row: 10 }]);
  const b = zone('b', [{ name: 'The Ford', col: 20, row: 20 }]);
  const party = [
    {
      slot: 1,
      zone: 'a',
      body: { x: far ? 5000 : 330, y: far ? 5000 : 330 },
      hero: { stats: { hp: 50, maxHp: 50, level: 3 } },
    },
  ] as never[];
  const arena = {
    role: 'host',
    task: null,
    view: a,
    local: { zone: 'a', body: { x: 0, y: 0 } },
    party: () => party,
    mobs: [],
    zones: new Map([['a', a]]),
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
    zoneOf: () => a,
  } as unknown as Arena;
  const loaded: string[] = [];
  const zones = {
    ensure: (name: string) => {
      loaded.push(name);
      if (name === 'b') arena.zones.set('b', b);
      return Promise.resolve();
    },
  } as unknown as Zones;
  const content = {
    biomeOfMap: (z: string) => (z === 'shop' ? [z, { climate: null }] : [z, { climate: 'temperate' }]),
  } as unknown as ContentManager;
  const paid: [unknown, number, number][] = [];
  const sim = {
    onKill: () => {},
    onDefeat: () => {},
    reward: (p: unknown, xp: number, gold: number) => paid.push([p, xp, gold]),
    text: () => {},
  } as unknown as Simulation;
  const said: string[] = [];
  const desk = { say: (t: string) => said.push(t) } as unknown as DmDesk;
  const tasks = new DmTasks(arena, sim, desk);
  const epics = new DmEpics(arena, zones, content, tasks, desk, sim);
  const pick = (id: string) => {
    const { items } = epics.options();
    return items.findIndex((i) => i.label.startsWith(id));
  };
  return { arena, epics, tasks, paid, said, loaded, pick, party, b };
}

describe('epic quests, on the host', () => {
  beforeAll(() => setPlaces({}, {}, {}));

  it('lists the sagas the land can tell, each with its gauge on the button', () => {
    const { epics } = game();
    const { items } = epics.options();
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(4);
    for (const i of items)
      expect(i.label).toMatch(/\n★+☆* · (Short|Medium|Long|Grand) · \d steps · \d lands? · ~\d+ min$/);
  });

  it('tells a saga step by step, each a quest of the DM’s with the saga’s own words, and pays the party at the end', () => {
    const { arena, epics, tasks, paid, said, pick, party } = game();
    const i = pick('Quiet Errands');
    expect(i).toBeGreaterThanOrEqual(0);
    let ended = 0;
    epics.onDone = () => ended++;
    expect(epics.begin(i)).toBe(true);
    expect(said[0]).toContain('Quiet Errands');
    expect(epics.begin(i)).toBe(false); // one at a time
    for (let step = 1; step <= 3; step++) {
      epics.update();
      expect(arena.task).toMatchObject({ state: 'active', epic: { title: 'Quiet Errands', step, total: 3 } });
      expect(arena.task!.note).toBeTruthy();
      tasks.update(0.1); // the party stands at the place: reached
      expect(arena.task!.state).toBe('done');
      tasks.update(TASK_LINGER + 1);
    }
    expect(ended).toBe(1);
    expect(epics.active).toBe(false);
    expect(arena.task).toBeNull();
    expect(paid).toHaveLength(4); // each of the three steps, then the saga itself
    expect(paid.every(([p]) => p === party[0])).toBe(true);
    expect(paid[3]![1]).toBeGreaterThan(paid[0]![1]); // the saga pays more than a step
    expect(said.at(-1)).toContain('errands are done');
  });

  it('loads a land nobody has been to, and goes there when the step is set in it', () => {
    const { arena, epics, loaded, tasks, pick, party } = game();
    const i = pick('The Long Road');
    expect(i).toBeGreaterThanOrEqual(0);
    epics.begin(i);
    epics.update(); // the first step is a land over: not loaded yet
    expect(loaded).toContain('b');
    expect(arena.task).toBeNull();
    epics.update(); // now it is
    expect(arena.task).toMatchObject({ zone: 'b', epic: { step: 1, total: 4 } });
    expect(party.length).toBe(1);
    tasks.update(0.1); // the party is in the first land: nothing reached yet
    expect(arena.task!.state).toBe('active');
  });

  it('ends the saga when the DM calls a step off, and when a step fails', () => {
    const a = game();
    a.epics.begin(a.pick('Quiet Errands'));
    a.epics.update();
    a.tasks.cancel(); // by the DM
    expect(a.epics.active).toBe(false);
    expect(a.said.at(-1)).toContain('called off');
    expect(a.arena.task).toBeNull();

    const b = game(true); // the party is nowhere near the place: it can only time out
    b.epics.begin(b.pick('Quiet Errands'));
    b.epics.update();
    b.tasks.update(1600);
    expect(b.arena.task!.state).toBe('failed');
    expect(b.epics.active).toBe(false);
    expect(b.said.at(-1)).toContain('lost');
  });

  it('is only told by the host', () => {
    const { arena, epics, pick } = game();
    const i = pick('Quiet Errands');
    (arena as { role: string }).role = 'solo';
    expect(epics.begin(i)).toBe(false);
  });
});
