import { describe, expect, it } from 'vitest';
import { ENTRY_CAP, RECENT_EVENTS, ReportLog, isReportEntry, reportLine, stamp, type ReportState } from './reportLog';

const state = (over: Partial<ReportState> = {}): ReportState => ({
  who: 'P2',
  level: 3,
  hp: 20,
  maxHp: 40,
  zone: 'cave_sunscar',
  area: 'The Sunscar Hollow',
  at: [12, 30],
  quest: 'Hunt orcs (1/4)',
  party: { size: 2, avgHp: 0.6, lowest: 0.5 },
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
    xp: [10, 40],
    weapon: 'Bronze Sword',
    worn: ['Cloth Hood'],
    potions: 1,
    food: 80,
    water: 60,
    gold: 25,
    skills: [],
  },
  fight: {
    downs: 1,
    downsHere: 1,
    killsHere: 5,
    kills: 9,
    taken: 31,
    hitsTaken: 3,
    dealt: 44,
    by: { Orc: 3 },
    lastHurtBy: { foe: 'Orc', ago: 2 },
    pressure: 'steady',
  },
  place: { band: [4, 5], alive: 7, total: 12 },
  foes: [
    {
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
    },
  ],
  breather: false,
  stall: 12,
  recent: [],
  ...over,
});

describe('the report log', () => {
  it('keeps the last few events and hands them to whatever is noted next', () => {
    const log = new ReportLog();
    for (let i = 0; i < RECENT_EVENTS + 5; i++) log.event(i, `thing ${i}`);
    expect(log.recent).toHaveLength(RECENT_EVENTS);
    expect(log.recent.at(-1)).toBe(`${stamp(RECENT_EVENTS + 4)} thing ${RECENT_EVENTS + 4}`);
  });

  it('notes an entry with its state and counts it among the recent events', () => {
    const log = new ReportLog();
    const e = log.add(65.04, 'said', 2, 'this cave is too hard', state());
    expect(e).toMatchObject({ t: 65, kind: 'said', slot: 2, text: 'this cave is too hard' });
    expect(log.recent.at(-1)).toBe('1:05 P2 said: this cave is too hard');
  });

  it('drains only what is new, once', () => {
    const log = new ReportLog();
    log.add(1, 'ask', 1, 'We are lost', state());
    expect(log.drain()).toHaveLength(1);
    expect(log.drain()).toHaveLength(0);
    log.add(2, 'down', 1, 'knocked out', state());
    expect(log.drain().map((e) => e.kind)).toEqual(['down']);
    expect(log.all).toHaveLength(2);
  });

  it('drops the oldest past its cap without losing track of what was collected', () => {
    const log = new ReportLog();
    for (let i = 0; i < ENTRY_CAP + 10; i++) log.add(i, 'signal', 0, `s${i}`, state());
    expect(log.all).toHaveLength(ENTRY_CAP);
    log.drain();
    log.add(9999, 'signal', 0, 'last', state());
    expect(log.drain().map((e) => e.text)).toEqual(['last']);
  });

  it('prints an entry as one console line the bot can read back, and checks the shape of what a page gives it', () => {
    const e = new ReportLog().add(5, 'note', 0, '\u{1F61E}', state());
    const line = reportLine(e);
    expect(line.startsWith('[report] ')).toBe(true);
    expect(isReportEntry(JSON.parse(line.slice(9)))).toBe(true);
    expect(isReportEntry({ t: 1 })).toBe(false);
    expect(isReportEntry(null)).toBe(false);
  });

  it('forgets everything on reset', () => {
    const log = new ReportLog();
    log.add(1, 'ask', 1, 'x', state());
    log.reset();
    expect([log.all.length, log.recent.length, log.drain().length]).toEqual([0, 0, 0]);
  });
});
