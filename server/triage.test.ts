import { describe, expect, it } from 'vitest';
import type { Tag } from '../src/systems/feedback';
import type { ReportEntry, ReportKind, ReportState } from '../src/systems/reportLog';
import { RulesTagger, type Tagger } from './tag';
import { MAX_FINDINGS, hotspots, triage } from './triage';

const foe = (over = {}) => ({
  name: 'Orc',
  count: 3,
  near: 2,
  maxHp: 91,
  attack: 24,
  defense: 3,
  xp: 46,
  blows: 13,
  hits: 2,
  verdict: 'deadly',
  typical: 'fair',
  ...over,
});

const state = (over: Partial<ReportState> = {}, withDetail = true): ReportState => ({
  who: 'P2',
  level: 2,
  hp: 9,
  maxHp: 36,
  zone: 'cave_sunscar',
  area: 'The Sunscar Hollow',
  at: [14, 30],
  quest: null,
  party: { size: 2, avgHp: 0.4, lowest: 0.25 },
  breather: false,
  stall: 0,
  recent: [],
  ...(withDetail
    ? {
        detail: {
          hero: {
            attack: 6,
            attackGear: 4,
            power: 10,
            defense: 1,
            defenseGear: 2,
            armor: 3,
            magic: 2,
            mp: 8,
            maxMp: 12,
            xp: [1, 40] as [number, number],
            weapon: 'Bronze Sword',
            worn: [],
            potions: 0,
            food: 80,
            water: 80,
            gold: 5,
            skills: [],
          },
          fight: {
            downs: 1,
            downsHere: 1,
            killsHere: 2,
            kills: 4,
            taken: 30,
            hitsTaken: 3,
            dealt: 20,
            by: { Orc: 3 },
            lastHurtBy: { foe: 'Orc', ago: 2 },
            pressure: 'steady',
          },
          place: { band: [4, 5] as [number, number], alive: 7, total: 12 },
          foes: [foe()],
        },
      }
    : {}),
  ...over,
});

let clock = 0;
const entry = (kind: ReportKind, text: string, over: Partial<ReportState> = {}, tag?: Tag): ReportEntry => ({
  t: (clock += 10),
  kind,
  slot: 2,
  text,
  state: state(over),
  ...(tag ? { tag } : {}),
});
const jev = (kind: Tag['kind'], severity = 2, confidence = 0.9): Tag => ({ kind, severity, confidence, by: 'jev' });

describe('hotspots', () => {
  it('finds knockouts piling up in an area, and a single one by a hero under the zone’s band', () => {
    const two = [
      entry('down', 'knocked out in The Sunscar Hollow by Orc'),
      entry('down', 'knocked out in The Sunscar Hollow by Orc'),
    ];
    const found = hotspots(two);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ kind: 'too_hard', area: 'The Sunscar Hollow', foe: 'Orc' });
    expect(found[0]!.why).toContain('2 knockouts in The Sunscar Hollow, mostly to Orc');
    const lone = [entry('down', 'knocked out in A by Troll', { area: 'A', level: 2 })]; // level 2 under a 4-5 band
    expect(hotspots(lone)[0]!.why).toContain('under the zone’s level band');
    expect(hotspots([entry('down', 'knocked out', { level: 6 })])).toHaveLength(0);
  });

  it('finds the director repeating itself, counting the repeats it folded in', () => {
    const calm = [entry('signal', 'struggle'), entry('signal', 'struggle')];
    expect(hotspots(calm)).toHaveLength(0);
    const storm = [entry('signal', 'struggle'), entry('signal', 'struggle (+3 repeats since)')];
    expect(hotspots(storm)[0]).toMatchObject({ kind: 'too_hard' });
    expect(hotspots(storm)[0]!.why).toContain('5 times');
  });

  it('finds long stalls seen more than once in an area', () => {
    const stalls = [entry('said', 'hm', { stall: 200 }), entry('signal', 'lost', { stall: 150 })];
    expect(hotspots(stalls).map((h) => h.kind)).toEqual(expect.arrayContaining(['pace']));
    expect(hotspots([entry('said', 'hm', { stall: 200 })])).toHaveLength(0);
  });
});

describe('triage', () => {
  it('clusters words and hotspots about the same thing into one ranked finding with its evidence', async () => {
    clock = 0;
    const log = [
      entry('said', 'the cave is too hard', {}, jev('too_hard', 2)),
      entry('down', 'knocked out in The Sunscar Hollow by Orc'),
      entry('down', 'knocked out in The Sunscar Hollow by Orc', { who: 'P3' }),
      entry('said', 'I love the tavern', {}, jev('praise', 0)),
    ];
    const { findings, praise } = await triage(log, new RulesTagger());
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f).toMatchObject({
      id: 'F1',
      kind: 'too_hard',
      area: 'The Sunscar Hollow',
      foe: 'Orc',
      severity: 3,
      count: 3,
    });
    expect(f.players).toEqual(['P2', 'P3']);
    expect(f.quotes).toEqual(['the cave is too hard']);
    expect(f.evidence[0]).toBe(0); // the player's words are the first evidence
    expect(f.why.join(' ')).toContain('2 knockouts');
    expect(f.why.join(' ')).toContain('the numbers agree with P2');
    expect(praise).toEqual(['I love the tavern']);
  });

  it('checks a complaint against the numbers and says when they disagree', async () => {
    clock = 0;
    const log = [entry('said', 'goblins are too easy', {}, jev('too_easy', 1))];
    const { findings } = await triage(log, new RulesTagger());
    expect(findings[0]!.why.join(' ')).toContain('the numbers say otherwise');
    expect(findings[0]!.why.join(' ')).toContain('Orc: 13 blows to fell it, 2 hits to fell P2 [deadly');
  });

  it('reads again what the live pass left out or was unsure of, and never what a canned ask already said', async () => {
    clock = 0;
    const asked: string[] = [];
    const tagger: Tagger = {
      tag: (e) => {
        asked.push(e.text);
        return Promise.resolve(jev('bug', 3));
      },
    };
    const log = [
      entry('said', 'untagged words'),
      entry('said', 'unsure words', {}, jev('other', 0, 0.3)),
      entry('said', 'sure words', {}, jev('too_hard', 2, 0.9)),
      entry('ask', 'This is too hard'),
    ];
    const { findings } = await triage(log, tagger);
    expect(asked.sort()).toEqual(['unsure words', 'untagged words']);
    expect(findings.some((f) => f.kind === 'bug' && f.severity === 3)).toBe(true);
  });

  it('ranks by severity, count and how many players, and keeps only the strongest few', async () => {
    clock = 0;
    const log: ReportEntry[] = [];
    for (let i = 0; i < MAX_FINDINGS + 4; i++)
      log.push(entry('said', `thing ${i}`, { area: `Area ${i}` }, jev('confusing', 1)));
    for (let i = 0; i < 3; i++) log.push(entry('said', 'it crashes', { area: 'Area 0' }, jev('bug', 3)));
    const { findings } = await triage(log, new RulesTagger());
    expect(findings).toHaveLength(MAX_FINDINGS);
    expect(findings[0]).toMatchObject({ id: 'F1', kind: 'bug', area: 'Area 0', severity: 3, count: 3 });
    expect(findings.map((f) => f.score)).toEqual([...findings.map((f) => f.score)].sort((a, b) => b - a));
  });

  it('finds nothing in a game with only good news', async () => {
    clock = 0;
    const { findings, praise } = await triage([entry('said', 'fun!', {}, jev('praise', 0))], new RulesTagger());
    expect(findings).toEqual([]);
    expect(praise).toEqual(['fun!']);
  });
});
