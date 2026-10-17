import { beforeAll, describe, expect, it } from 'vitest';
import { MEET_WORDS, SAGA_LOST_WORDS, SAGA_OFF_WORDS, SAGA_QUIET_WORDS, TALK_NUDGE_WORDS } from '../../systems/dmVoice';
import type { ContentManager } from '../../content/ContentManager';
import { STOCK_EPICS } from '../../content/epics';
import { parseEpic } from '../../systems/dmEpics';
import { GEAR_SLOTS, newHero } from '../../systems/combat';
import { TASK_LINGER } from '../../systems/dmTasks';
import { setPlaces } from '../../systems/places';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmEpics } from './DmEpics';
import { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';
import type { Zones } from './Zones';

/** Two open lands, a and b, and a shop off a; a has a place to reach, b has none, and the party stands at the place. */
function game(far = false, story: unknown = null, stock: typeof STOCK_EPICS = STOCK_EPICS) {
  setPlaces({ a: 'The Glen', b: 'The Fen', shop: 'Shop' }, { a: ['b', 'shop'] }, {});
  const zone = (name: string, places: { name: string; col: number; row: number }[]) =>
    ({
      name,
      sites: [],
      keepers: [],
      barrels: [],
      folk: [] as { name: string; body: { x: number; y: number } }[],
      data: { width: 100, height: 100, places, spawn: { col: 3, row: 3 } },
      collision: { fitsMap: () => true, isBlocked: () => false },
    }) as never;
  const a = zone('a', [{ name: 'The Old Mill', col: 10, row: 10 }]);
  const b = zone('b', [{ name: 'The Ford', col: 20, row: 20 }]);
  const party = [
    {
      slot: 1,
      zone: 'a',
      body: { x: far ? 5000 : 330, y: far ? 5000 : 330 },
      hero: { ...newHero(), stats: { ...newHero().stats, hp: 50, maxHp: 50, level: 3 } },
    },
  ] as never[];
  const arena = {
    role: 'host',
    task: null,
    view: a,
    local: { zone: 'a', body: { x: 0, y: 0 } },
    party: () => party,
    partyAll: () => party,
    mobs: [],
    zones: new Map([['a', a]]),
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
    zoneOf: () => a,
    refreshLook: () => {},
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
  const epics = new DmEpics(arena, zones, content, tasks, desk, sim, story as never, () => stock);
  /** The saga's place on the page of options it is shown on, turning pages until it is found (-1 if never). */
  const pick = (id: string) => {
    for (let n = 0; n < 10; n++) {
      const { items, more } = epics.options();
      const i = items.findIndex((x) => x.label.startsWith(id));
      if (i >= 0 || !more) return i;
      epics.turnPage();
    }
    return -1;
  };
  return { arena, epics, tasks, paid, said, loaded, pick, party, a, b };
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

  it('browses sagas as pages that never repeat, never wrap, and can go back', () => {
    const base = STOCK_EPICS.filter((e) => !e.steps.some((st) => st.kind === 'meet'));
    const many = Array.from({ length: 10 }, (_, i) => ({ ...base[i % base.length]!, title: `Saga ${i}` }));
    const { epics } = game(false, null, many);
    const seen: string[][] = [];
    for (let n = 0; n < 20; n++) {
      const o = epics.options();
      expect(o.page).toBe(n);
      expect(o.back).toBe(n > 0);
      seen.push(o.items.map((i) => i.label.split('\n')[0]!));
      if (!o.more) break;
      epics.turnPage();
    }
    expect(seen.length).toBe(Math.ceil(many.length / 4));
    const flat = seen.flat();
    expect(new Set(flat).size).toBe(flat.length); // no saga on two pages, so no list is shown twice
    epics.turnPage(); // past the end stays on the last page
    expect(epics.options().more).toBe(false);
    epics.turnPage(-1);
    expect(epics.options().items.map((i) => i.label.split('\n')[0])).toEqual(seen[seen.length - 2]);
    epics.firstPage();
    expect(epics.options()).toMatchObject({ page: 0, back: false, more: true });
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
      for (let i = 0; i < 3; i++) epics.update(5); // the step's aftermath is told, then the next begins
    }
    expect(said.some((w) => w.includes('boot print that is not theirs'))).toBe(true); // a turn of the tale between steps
    for (let i = 0; i < 4; i++) epics.update(5); // the closing scene is told, line by line
    expect(ended).toBe(1);
    expect(epics.active).toBe(false);
    expect(arena.task).toBeNull();
    expect(paid).toHaveLength(4); // each of the three steps, then the saga itself
    expect(paid.every(([p]) => p === party[0])).toBe(true);
    expect(paid[3]![1]).toBeGreaterThan(paid[0]![1]); // the saga pays more than a step
    expect(said.at(-2)).toContain('village sleeps safely');
    expect(said.at(-1)).toMatch(/for your trouble: \w/); // a gear upgrade for the hero, in the pack or worn
    const owned = (h: ReturnType<typeof newHero>) =>
      [...GEAR_SLOTS.map((slot) => h[slot]), ...h.pack].flatMap((i) => i ?? []);
    const hero = (party[0] as unknown as { hero: ReturnType<typeof newHero> }).hero;
    const start = owned(newHero()).map((i) => i.name);
    const fresh = owned(hero).filter((i) => !start.includes(i.name));
    expect(fresh).toHaveLength(1); // one new piece, in whatever slot helps most
    expect(said.at(-1)).toContain(fresh[0]!.name); // the piece the DM named is the one they hold
    expect(said.at(-1)).toMatch(/You each earn \d+ XP and \d+ gold/); // the party is told what they got
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
    expect(SAGA_OFF_WORDS.some((w) => a.said.at(-1)!.endsWith(w))).toBe(true);
    expect(a.said.at(-1)).toMatch(/^“Quiet Errands” ends at step 1 of 3, unfinished: no saga reward\./); // said outright
    expect(a.arena.task).toBeNull();

    const b = game(true); // the party is nowhere near the place: it can only time out
    b.epics.begin(b.pick('Quiet Errands'));
    b.epics.update();
    b.tasks.update(1600);
    expect(b.arena.task!.state).toBe('failed');
    expect(b.epics.active).toBe(false);
    expect(SAGA_LOST_WORDS.some((w) => b.said.at(-1)!.endsWith(w))).toBe(true);
    expect(b.said.at(-1)).toContain('ends at step 1 of 3');
  });

  it('tells what a won step paid, and never offers a second saga while one runs', () => {
    const { epics, tasks, said, pick } = game();
    epics.begin(pick('Quiet Errands'));
    epics.update();
    tasks.update(0.1);
    expect(said.at(-1)).toMatch(/^Step 1 of 3 done\. You each earn \d+ XP and \d+ gold\.$/);
    tasks.update(TASK_LINGER + 1); // between steps: no quest up, the saga still runs
    expect(epics.active).toBe(true);
    expect(epics.beginEpic(STOCK_EPICS[0]!).ok).toBe(false);
    expect(epics.begin(0)).toBe(false);
  });

  it('is told by the host or a solo player, never by a friend', () => {
    const { arena, epics, pick } = game();
    const i = pick('Quiet Errands');
    (arena as { role: string }).role = 'client';
    expect(epics.begin(i)).toBe(false);
    (arena as { role: string }).role = 'solo';
    expect(epics.begin(i)).toBe(true);
  });
});

describe('epics with people, on the host', () => {
  beforeAll(() => setPlaces({}, {}, {}));

  /** A live world that makes people: `bring` puts them in zone a's folk like the real cast does. */
  function live(canChoose = true) {
    const brought: { name: string; look: string }[] = [];
    const voiced: [string, string[]][] = [];
    let a: { folk: { name: string; body: { x: number; y: number } }[] } | null = null;
    const story = {
      canChoose,
      lastNote: '',
      regionOf: () => 'r1',
      isHaven: () => false,
      world: {
        lookOptions: () => [
          { id: 'keeper_look', name: 'Keeper Ysolde' },
          { id: 'sage_look', name: 'Sage' },
        ],
      },
      bring(person: { name: string; look: string }, _region: string, col: number, row: number) {
        brought.push(person);
        a!.folk.push({ name: person.name, body: { x: (col + 0.5) * 32, y: (row + 1) * 32 } });
        return `dm_${person.name.split(' ')[0]!.toLowerCase()}`;
      },
      voice: (id: string, lines: string[]) => voiced.push([id, lines]),
    };
    const g = game(false, story);
    a = g.a;
    return { ...g, brought, voiced };
  }

  it('offers epics with people only where people can be made', () => {
    expect(live().pick('The Lost Courier')).toBeGreaterThanOrEqual(0);
    expect(live(false).pick('The Lost Courier')).toBe(-1);
  });

  it('makes the person, sends the party to them, lets them speak when talked to, and moves on', () => {
    const { arena, epics, tasks, party, said, brought, voiced, pick } = live();
    const i = pick('The Lost Courier');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(epics.begin(i)).toBe(true);
    epics.update(0);
    expect(brought.map((p) => [p.name, p.look])).toEqual([['Aldis the Postmaster', 'keeper_look']]);
    expect(arena.task).toMatchObject({
      kind: 'visit',
      title: 'Find Aldis the Postmaster',
      epic: { step: 1, total: 4 },
    });
    // the party walks to them: the quest is done, and they have something to tell when talked to (not through the DM)
    const t = arena.task as unknown as { x: number; y: number };
    const me = party[0] as unknown as { body: { x: number; y: number } };
    me.body.x = t.x;
    me.body.y = t.y;
    tasks.update(0.1);
    tasks.update(TASK_LINGER + 1);
    expect(said.some((s) => s.includes('“'))).toBe(false); // nobody's words come out of the DM's mouth
    expect(voiced.at(-1)?.[0]).toBe('dm_aldis'); // their words are on them, for the talk
    const told = voiced.length;
    expect(MEET_WORDS.map((w) => w('Aldis the Postmaster'))).toContain(said.at(-1));
    epics.update(10);
    expect(epics.view).toMatchObject({ step: 1 }); // the saga waits for the talk
    epics.talked('dm_somebody'); // someone else: no change
    epics.update(10);
    expect(voiced).toHaveLength(told);
    epics.talked('dm_aldis');
    expect(voiced).toHaveLength(told + 1); // from now on they speak of what has happened
    expect(voiced.at(-1)).toEqual([
      'dm_aldis',
      expect.arrayContaining([expect.stringContaining('You found the courier')]),
    ]);
    epics.update(1);
    expect(epics.view).toMatchObject({ step: 1 }); // a moment to read first
    epics.update(5);
    epics.update(0); // the next step begins (its land is loaded first)
    epics.update(0);
    expect(arena.task).toMatchObject({ epic: { step: 2, total: 4 } });
    expect(epics.active).toBe(true);
  });

  it('puts another errand in their place when the person cannot be made, and ends only if the land has none', () => {
    const g = live();
    const ground = (g.a as unknown as { collision: { fitsMap: () => boolean; isBlocked: () => boolean } }).collision;
    ground.fitsMap = () => false;
    ground.isBlocked = () => true;
    g.epics.begin(g.pick('The Lost Courier'));
    g.epics.update(0);
    expect(g.brought).toHaveLength(0);
    if (g.epics.active) expect(g.arena.task).toMatchObject({ epic: { step: 1 } });
    else {
      expect(SAGA_QUIET_WORDS.some((w) => g.said.at(-1)!.endsWith(w))).toBe(true);
      expect(g.said.at(-1)).toContain('ends at step 1 of');
    }
  });

  it('never leaves the party standing by a person: reminds them, then goes on without a word', () => {
    const { arena, epics, tasks, party, said, pick } = live();
    epics.begin(pick('The Lost Courier'));
    epics.update(0);
    const me = party[0] as unknown as { body: { x: number; y: number } };
    const t = arena.task as unknown as { x: number; y: number };
    [me.body.x, me.body.y] = [t.x, t.y];
    tasks.update(0.1);
    tasks.update(TASK_LINGER + 1);
    const heard = said.length;
    epics.update(25); // a while by the person, and no word spoken
    expect(said.length).toBe(heard + 1);
    expect(TALK_NUDGE_WORDS.map((w) => w('Aldis the Postmaster'))).toContain(said.at(-1));
    for (let i = 0; i < 8; i++) epics.update(25); // still nothing: the saga goes on
    epics.update(0);
    epics.update(0);
    expect(arena.task).toMatchObject({ epic: { step: 2 } });
  });

  it('has each person say their last words when the whole epic is done', () => {
    const { arena, epics, tasks, party, voiced } = live();
    const epic = parseEpic({
      id: 'short_one',
      title: 'Short One',
      tagline: 'Meet, then reach.',
      difficulty: 1,
      opening: 'It begins.',
      ending: 'It is over.',
      people: { mira: { name: 'Mira', lines: ['Hello.'], after: ['Thank you.'], finished: ['It is over, friends.'] } },
      steps: [
        { kind: 'meet', hop: 0, who: 'mira', tell: 'Find Mira.', says: ['Well met.'] },
        { kind: 'visit', hop: 0, tell: 'Go to the mill.' },
      ],
    });
    if (typeof epic === 'string') throw new Error(epic);
    expect(epics.beginEpic(epic)).toEqual({ ok: true, note: '' });
    expect(epics.beginEpic(epic)).toMatchObject({ ok: false }); // a second one is refused while one runs
    epics.update(0);
    const me = party[0] as unknown as { body: { x: number; y: number } };
    const t = arena.task as unknown as { x: number; y: number };
    [me.body.x, me.body.y] = [t.x, t.y];
    tasks.update(0.1);
    tasks.update(TASK_LINGER + 1);
    epics.update(0);
    expect(voiced).toEqual([['dm_mira', ['Well met.']]]);
    epics.talked('dm_mira');
    epics.update(5);
    expect(voiced.at(-1)).toEqual(['dm_mira', ['Thank you.']]);
    epics.update(0); // the second step: the party goes to the mill
    [me.body.x, me.body.y] = [330, 330];
    tasks.update(0.1);
    tasks.update(TASK_LINGER + 1);
    for (let i = 0; i < 4; i++) epics.update(5); // the closing scene
    expect(epics.active).toBe(false);
    expect(voiced.at(-1)).toEqual(['dm_mira', ['It is over, friends.']]);
  });
});
