import { describe, expect, it } from 'vitest';
import { Engagement, IDLE_AFTER, NOTE_MAX, span, type Frame } from './engagement';

const frame = (over: Partial<Frame> = {}): Frame => ({
  input: true,
  zone: 'greenwood',
  level: 1,
  breather: false,
  ...over,
});

describe('engagement counters', () => {
  it('counts busy time only while there is input, and idle after', () => {
    const e = new Engagement();
    for (let i = 0; i < 10; i++) e.tick(1, frame());
    for (let i = 0; i < IDLE_AFTER + 10; i++) e.tick(1, frame({ input: false }));
    expect(e.seconds).toBe(40);
    expect(e.active).toBe(10 + IDLE_AFTER - 1);
  });

  it('times the first kill and quest by busy time, and counts events', () => {
    const e = new Engagement();
    e.tick(5, frame());
    e.questStarted();
    e.tick(7, frame());
    e.killed();
    e.killed();
    e.questDone();
    e.questLost();
    expect(e.firstQuestAt).toBe(5);
    expect(e.firstKillAt).toBe(12);
    expect([e.kills, e.quests]).toEqual([2, { started: 1, done: 1, lost: 1 }]);
  });

  it('measures the longest stall, never counting idle time or a stretch a kill ended', () => {
    const e = new Engagement();
    for (let i = 0; i < 15; i++) e.tick(1, frame());
    e.killed();
    for (let i = 0; i < 5; i++) e.tick(1, frame());
    for (let i = 0; i < 100; i++) e.tick(1, frame({ input: false })); // away
    expect(e.longestStall).toBeLessThan(15 + IDLE_AFTER);
    expect(e.longestStall).toBeGreaterThanOrEqual(15);
  });

  it('keeps time, visits and knockouts per zone, and the breather clock', () => {
    const e = new Engagement();
    e.tick(10, frame({ zone: 'a' }));
    e.tick(5, frame({ zone: 'b', breather: true }));
    e.tick(5, frame({ zone: 'a' }));
    e.knockedOut('b');
    expect(e.zones.get('a')).toEqual({ seconds: 15, entries: 2, knockouts: 0 });
    expect(e.zones.get('b')).toEqual({ seconds: 5, entries: 1, knockouts: 1 });
    expect(e.breatherSeconds).toBe(5);
    expect(e.knockouts).toBe(1);
  });

  it('keeps a mood tally and a trimmed note', () => {
    const e = new Engagement();
    e.mood('good');
    e.mood('good');
    e.mood('bad');
    e.stuckPressed();
    e.setNote(`  too   hard\nin the cave ${'x'.repeat(NOTE_MAX)}`);
    expect(e.moods).toEqual({ good: 2, ok: 0, bad: 1 });
    expect(e.stuck).toBe(1);
    expect(e.note.startsWith('too hard in the cave')).toBe(true);
    expect(e.note.length).toBe(NOTE_MAX);
  });

  it('writes a plain-text report and a one-line JSON', () => {
    const e = new Engagement();
    e.tick(65, frame({ level: 2 }));
    e.killed();
    e.setNote('fun');
    const text = e.text({ build: 'abc12345', name: (z) => z.toUpperCase(), visit: 3 });
    expect(text).toContain('build abc12345 · visit 3');
    expect(text).toContain('Playing 1:05');
    expect(text).toContain('Kills 1');
    expect(text).toContain('GREENWOOD 1:05 (1x)');
    expect(text).toContain('Note: fun');
    expect(JSON.parse(e.line())).toMatchObject({ s: 65, kills: 1, lv: 2 });
  });

  it('formats spans', () => {
    expect(span(65)).toBe('1:05');
    expect(span(3725)).toBe('1:02:05');
  });
});
