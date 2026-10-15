import { describe, expect, it } from 'vitest';
import { briefing, cleanNote, MAX_NOTE, type BriefNames } from './dmBrief';
import type { TaskView } from './dmTasks';

const names: BriefNames = {
  foe: (k) => (k === 'goblin' ? 'Goblin' : k),
  site: () => 'Echostone',
  item: () => 'the Wayfarer’s Charm',
  area: (z) => (z === 'greenwood' ? 'The Greenwood' : z),
};
const task = (over: Partial<TaskView>): TaskView => ({
  kind: 'hunt',
  state: 'active',
  title: 'Hunt 5 Goblins',
  progress: 0,
  goal: 5,
  zone: 'greenwood',
  x: 0,
  y: 0,
  what: 'goblin',
  bits: 0,
  hint: false,
  ...over,
});

describe('briefing', () => {
  it('tells each kind of quest in three pages, with what it asks and where', () => {
    for (const [kind, what] of [
      ['hunt', 'goblin'],
      ['gather', 'echostone'],
      ['find', 'charm'],
      ['visit', 'the Old Mill'],
    ] as const) {
      const pages = briefing(task({ kind, what }), names);
      expect(pages).toHaveLength(3);
      for (const p of pages) expect(p.length).toBeGreaterThan(60);
      expect(pages.join(' ')).toContain('The Greenwood');
    }
  });

  it('names the foe, the count and how the reward comes', () => {
    const text = briefing(task({}), names).join(' ');
    expect(text).toContain('Goblins');
    expect(text).toContain('5 of them');
    expect(text).toContain('reward');
  });

  it('is the same on every page for the same quest', () => {
    expect(briefing(task({}), names)).toEqual(briefing(task({}), names));
  });

  it('keeps a DM’s own instructions to one trimmed line', () => {
    expect(cleanNote('  go\n  north  ')).toBe('go north');
    expect(cleanNote('x'.repeat(MAX_NOTE + 40))).toHaveLength(MAX_NOTE);
  });
});
