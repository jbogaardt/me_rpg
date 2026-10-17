import { describe, expect, it } from 'vitest';
import { STOCK_EPICS as EPICS } from '../content/epics';
import {
  epicReward,
  epicsFrom,
  gauge,
  gaugeText,
  layers,
  parseEpic,
  parseEpics,
  needsPeople,
  planEpic,
  stars,
  tellStep,
  type ZoneGraph,
} from './dmEpics';

/** a - b - c - d - e in a line, plus a shop off b. */
const line = (names: string[], shops: string[] = []): ZoneGraph => ({
  neighbours: (z) => {
    const i = names.indexOf(z);
    if (i < 0) return z === 'shop' ? ['b'] : [];
    return [names[i - 1], names[i + 1], ...(z === 'b' ? shops : [])].filter((n): n is string => !!n);
  },
  open: (z) => z !== 'shop',
});
const big = line(['a', 'b', 'c', 'd', 'e', 'f'], ['shop']);

describe('planning a saga onto a world', () => {
  it('walks the lands by distance and leaves out the rooms', () => {
    expect(layers(big, 'a')).toEqual([['a'], ['b'], ['c'], ['d'], ['e'], ['f']]);
    expect(planEpic(EPICS[0]!, 'shop', big)).toBeNull();
  });

  it('sets each step the right distance out, clamped to the farthest land a small world has', () => {
    const long = EPICS.find((e) => e.id === 'long_road')!;
    expect(planEpic(long, 'a', big)!.zones).toEqual(['b', 'b', 'c', 'c']);
    const small = line(['x', 'y']);
    const plan = planEpic(long, 'x', small)!;
    expect(plan.zones).toEqual(['y', 'y', 'y', 'y']);
    expect(plan.zones.every((z) => z === 'x' || z === 'y')).toBe(true);
  });

  it('is the same for the same seed, and is never in a shop', () => {
    const rich: ZoneGraph = { neighbours: (z) => (z === 's' ? ['p', 'q', 'r'] : ['s']), open: () => true };
    const a = planEpic(EPICS[2]!, 's', rich, 7);
    expect(planEpic(EPICS[2]!, 's', rich, 7)).toEqual(a);
    for (const e of EPICS) for (const z of planEpic(e, 'a', big)!.zones) expect(big.open(z)).toBe(true);
  });
});

describe('the gauge', () => {
  it('rises with the saga: a few chores close to home are short and easy, the Hollow Crown is a trial', () => {
    const quiet = gauge(
      planEpic(
        EPICS.find((e) => e.id === 'quiet_errands')!,
        'a',
        big,
      )!,
    );
    const crown = gauge(
      planEpic(
        EPICS.find((e) => e.id === 'hollow_crown')!,
        'a',
        big,
      )!,
    );
    expect(quiet).toMatchObject({ difficulty: 1, length: 'Short', steps: 3 });
    expect(crown.difficulty).toBe(5);
    expect(crown.minutes).toBeGreaterThan(quiet.minutes);
    expect(crown.lands).toBeGreaterThan(quiet.lands);
    expect(['Long', 'Grand']).toContain(crown.length);
  });

  it('reads as stars, a length, steps and lands', () => {
    expect(stars(3)).toBe('★★★☆☆');
    const text = gaugeText(gauge(planEpic(EPICS[1]!, 'a', big)!));
    expect(text).toMatch(/^★+☆* · (Short|Medium|Long|Grand) · 4 steps · \d lands · ~\d+ min$/);
  });

  it('pays more for a bigger saga', () => {
    const pay = (id: string) =>
      epicReward(
        planEpic(
          EPICS.find((e) => e.id === id)!,
          'a',
          big,
        )!,
      );
    expect(pay('hollow_crown').xp).toBeGreaterThan(pay('quiet_errands').xp);
    expect(pay('hollow_crown').gold).toBeGreaterThan(pay('quiet_errands').gold);
  });
});

describe('the sagas', () => {
  it('are a bunch, each with a story to tell at every step, and ask for no content id', () => {
    expect(EPICS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(EPICS.map((e) => e.id)).size).toBe(EPICS.length);
    for (const e of EPICS) {
      expect(e.steps.length).toBeGreaterThanOrEqual(3);
      expect(e.opening.length).toBeGreaterThan(10);
      expect(e.ending.length).toBeGreaterThan(10);
      for (const s of e.steps) {
        expect(s.tell.length).toBeGreaterThan(10);
        expect(tellStep(s, 'The Fen', 'The Glen').length).toBeLessThanOrEqual(240); // a DM's note
        expect(tellStep(s, 'The Fen', 'The Glen')).not.toMatch(/[{}]/);
      }
      // a saga goes out a land at a time (it may also come back: a bell is returned where it hangs)
      const hops = e.steps.map((s) => s.hop);
      hops.forEach((h, i) => i && expect(h).toBeLessThanOrEqual(hops[i - 1]! + 1));
    }
  });

  it('are offered easiest and shortest first, and every difficulty is in range', () => {
    const list = epicsFrom('a', big, 0, EPICS, true);
    expect(list).toHaveLength(EPICS.length);
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.gauge.difficulty).toBeGreaterThanOrEqual(list[i - 1]!.gauge.difficulty);
    for (const { gauge: g } of list) expect(g.difficulty).toBeGreaterThanOrEqual(1);
    expect(epicsFrom('shop', big, 0, EPICS, true)).toEqual([]);
  });
});

describe('epics as data', () => {
  const epic = () => ({
    id: 'a_tale',
    title: 'A Epic',
    tagline: 'Short.',
    difficulty: 2,
    opening: 'It begins.',
    ending: 'It ends.',
    people: { mira: { name: 'Mira', look: 'sage', lines: ['Hello.'] } },
    steps: [
      { kind: 'meet', hop: 0, who: 'mira', tell: 'Find Mira in {area}.', says: ['Well met.'], gives: 'a Key' },
      { kind: 'hunt', hop: 1, tell: 'Clear {area}.' },
    ],
  });
  it('accepts a good epic and knows it needs people', () => {
    const parsed = parseEpic(epic());
    expect(typeof parsed).toBe('object');
    expect(needsPeople(parsed as never)).toBe(true);
  });
  it('accepts a boss or a mastery as a step, and counts them in the gauge', () => {
    const t = epic();
    t.steps.push(
      { kind: 'boss', hop: 2, tell: 'The beast of {area} waits.' },
      { kind: 'master', hop: 0, tell: 'Practise.' },
    );
    const parsed = parseEpic(t);
    expect(parsed).toMatchObject({ steps: [{ kind: 'meet' }, { kind: 'hunt' }, { kind: 'boss' }, { kind: 'master' }] });
    const plain = planEpic(parseEpic(epic()) as never, 'a', big)!;
    expect(gauge(planEpic(parsed as never, 'a', big)!).minutes).toBeGreaterThan(gauge(plain).minutes);
  });
  it('accepts the words a person says after and when it is over, and refuses bad ones', () => {
    const withLines = (v: unknown) => {
      const t = epic();
      (t.people.mira as Record<string, unknown>).after = v;
      (t.people.mira as Record<string, unknown>).finished = ['Done.'];
      return parseEpic(t);
    };
    expect(withLines(['Thanks.'])).toMatchObject({ people: { mira: { after: ['Thanks.'], finished: ['Done.'] } } });
    for (const bad of [[], ['x'.repeat(141)], 'nope', [1]]) expect(typeof withLines(bad)).toBe('string');
  });
  it('refuses each way an epic can be wrong, naming where', () => {
    const bad = (f: (t: ReturnType<typeof epic>) => void): string => {
      const t = epic();
      f(t);
      const r = parseEpic(t);
      return typeof r === 'string' ? r : 'ok';
    };
    expect(bad((t) => (t.id = 'Bad Id'))).toContain('id');
    expect(bad((t) => (t.difficulty = 9))).toContain('difficulty');
    expect(bad((t) => (t.steps = t.steps.slice(0, 1)))).toContain('steps');
    expect(bad((t) => (t.steps[0]!.who = 'nobody'))).toContain('not one of the epic');
    expect(bad((t) => (t.steps[0]!.says = []))).toContain('says');
    expect(bad((t) => ((t.steps[1] as { who?: string }).who = 'mira'))).toContain('only a meet step');
    expect(bad((t) => t.steps.push({ kind: 'meet', hop: 1, who: 'mira', tell: 'x', says: ['y'] } as never))).toContain(
      'twice',
    );
    expect(bad((t) => (t.steps[1] = { kind: 'dig', hop: 1, tell: 'x' } as never))).toContain('kind');
    expect(bad((t) => (t.steps[0]!.tell = 'x'.repeat(300)))).toContain('tell');
    expect(bad((t) => ((t.people.mira as { name: string }).name = ''))).toContain('people.mira');
    expect(bad((t) => ((t.people as Record<string, unknown>).ghost = { name: 'G', lines: ['boo'] }))).toContain(
      'never met',
    );
  });
  it('refuses a file with a repeated id', () => {
    expect(typeof parseEpics([epic(), epic()])).toBe('string');
    expect(Array.isArray(parseEpics([epic()]))).toBe(true);
  });
  it('leaves sagas with people out where none can be made', () => {
    const t = parseEpic(epic()) as never;
    expect(epicsFrom('a', big, 0, [t], false).some((e) => e.plan.epic.id === 'a_tale')).toBe(false);
    expect(epicsFrom('a', big, 0, [t], true).some((e) => e.plan.epic.id === 'a_tale')).toBe(true);
  });
});

describe('steps that name their task outright', () => {
  const base = () => ({
    id: 'named',
    title: 'Named',
    tagline: 'A saga about this world.',
    difficulty: 2,
    opening: 'It begins.',
    ending: 'It ends.',
    steps: [
      { objective: { t: 'kill', kind: 'goblin', count: 5, zone: 'fen' }, tell: 'Drive the goblins out of {area}.' },
      { kind: 'visit', hop: 1, tell: 'Then see {area}.' },
    ],
  });
  it('takes the campaign’s own words for a task, and sits where it says', () => {
    const epic = parseEpic(base());
    expect(epic).toMatchObject({
      steps: [{ kind: 'hunt', hop: 0, objective: { t: 'kill', kind: 'goblin', zone: 'fen' } }, {}],
    });
    const line = { neighbours: (z: string) => (z === 'a' ? ['b'] : ['a']), open: () => true };
    expect(planEpic(epic as never, 'a', line)!.zones[0]).toBe('fen'); // not a hop from the start: where it says
    expect(planEpic(epic as never, 'a', line)!.zones[1]).toBe('b');
  });
  it('refuses a task a saga cannot set: a bring, a meet, a missing zone, nothing to count', () => {
    const bad = (objective: unknown) => parseEpic({ ...base(), steps: [{ objective, tell: 'x' }, base().steps[1]] });
    for (const o of [
      { t: 'bring', item: 'x', count: 1, zone: 'fen' },
      { t: 'meet', count: 1, zone: 'fen' },
      { t: 'kill', kind: 'goblin', count: 5 },
      { t: 'kill', kind: 'goblin', count: 0, zone: 'fen' },
      { t: 'gather', zone: 'fen', count: 2 },
      'kill',
    ])
      expect(typeof bad(o), JSON.stringify(o)).toBe('string');
    const meet = { ...base().steps[0], who: 'x' };
    expect(typeof parseEpic({ ...base(), steps: [meet, base().steps[1]] })).toBe('string');
  });
});
