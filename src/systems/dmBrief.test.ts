import { describe, expect, it } from 'vitest';
import { briefing, objective, cleanNote, MAX_NOTE, type BriefNames } from './dmBrief';
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
  hint: 0,
  ...over,
});

describe('briefing', () => {
  it('tells each kind of quest in three pages, with what it asks and where', () => {
    for (const [kind, what] of [
      ['hunt', 'goblin'],
      ['gather', 'echostone'],
      ['find', 'charm'],
      ['find', 'charm@goblin'],
      ['visit', 'the Old Mill'],
    ] as const) {
      const pages = briefing(task({ kind, what }), names);
      expect(pages).toHaveLength(3);
      for (const p of pages) expect(p.length).toBeGreaterThan(60);
      expect(pages.join(' ')).toContain('The Greenwood');
    }
  });

  it('tells a boss by name and a mastery by its spell and the arrows that cast it, in several wordings', () => {
    const boss = task({ kind: 'boss', goal: 1, what: 'goblin:480', title: 'Slay the Hollow Goblin King' });
    const bossPages = briefing(boss, names);
    expect(bossPages).toHaveLength(3);
    expect(bossPages.join(' ')).toContain('the Hollow Goblin King');
    expect(bossPages.join(' ')).toContain('The Greenwood');
    expect(objective(boss, names)).toBe('Defeat the Hollow Goblin King in The Greenwood.');
    const master = task({ kind: 'master', goal: 3, what: 'bolt:uurl', title: 'Master Arcane Bolt: cast it 3 times' });
    const text = briefing(master, names).join(' ');
    expect(text).toContain('Arcane Bolt');
    expect(text).toContain('↑↑→←'); // the arrows as the menu shows them
    expect(text).toContain('up, up, right, left'); // and in words
    expect(objective(master, names)).toBe('Cast Arcane Bolt 3 times in The Greenwood: ↑↑→←.');
    // not one stock line: other quests of the kind are told other ways
    const told = (n: number) =>
      new Set(
        Array.from(
          { length: n },
          (_, i) => briefing({ ...boss, title: `Slay boss ${i}`, what: `goblin:${480 + i}` }, names)[0],
        ),
      );
    expect(told(12).size).toBeGreaterThan(2);
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

describe('objective', () => {
  it('says what is wanted as plainly as the tracker', () => {
    expect(objective(task({ goal: 4 }), names)).toBe('Defeat 4 Goblins in The Greenwood.');
    expect(objective(task({ goal: 1 }), names)).toBe('Defeat 1 Goblin in The Greenwood.');
    expect(objective(task({ kind: 'gather', goal: 3, what: 'echostone' }), names)).toBe(
      'Collect 3 Echostones in The Greenwood.',
    );
    expect(objective(task({ kind: 'find', goal: 1 }), names)).toBe(
      'Find the chest and open it for the Wayfarer’s Charm in The Greenwood.',
    );
    expect(objective(task({ kind: 'find', what: 'charm@goblin', goal: 1 }), names)).toBe(
      'Defeat a Goblin and take the Wayfarer’s Charm in The Greenwood.',
    );
  });
});
