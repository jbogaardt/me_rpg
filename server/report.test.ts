import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReportLog, type ReportState } from '../src/systems/reportLog';
import {
  MAX_ENTRIES,
  analysisPrompt,
  facts,
  looksRight,
  plainReport,
  redact,
  reportPath,
  scrub,
  timeline,
  writeReport,
  type GameInfo,
} from './report';

const state = (over: Partial<ReportState> = {}): ReportState => ({
  who: 'P2',
  level: 2,
  hp: 9,
  maxHp: 36,
  zone: 'cave_sunscar',
  area: 'The Sunscar Hollow',
  at: [14, 30],
  quest: 'Hunt orcs (1/4)',
  party: { size: 2, avgHp: 0.4, lowest: 0.25 },
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
  stall: 31,
  recent: ['1:00 the party killed goblin x3'],
  ...over,
});

const game: GameInfo = {
  code: 'brave-otters',
  started: new Date('2026-10-17T18:00:00Z'),
  ended: new Date('2026-10-17T18:42:00Z'),
  why: 'everyone left',
};

function log() {
  const l = new ReportLog();
  l.add(75, 'said', 2, 'this cave is way too hard, email me at bob@example.com', state());
  l.add(80, 'down', 2, 'knocked out in The Sunscar Hollow', state());
  l.add(90, 'signal', 0, 'struggle', state({ who: '-' }));
  l.add(120, 'note', 1, '\u{1F61E}', state({ who: 'P1', area: 'The Greenwood', level: 4 }));
  return l.all;
}

describe('scrubbing', () => {
  it('cuts links, emails and long numbers, and keeps a line a line', () => {
    expect(scrub('see https://x.io/a?b=1 or mail bob@example.com or call +1 (555) 123-4567')).toBe(
      'see [link] or mail [email] or call [number]',
    );
    expect(scrub('too   hard\nin the cave')).toBe('too hard in the cave');
    expect(redact('a\nb https://x.io')).toBe('a\nb [link]');
  });
});

describe('the timeline the analyst reads', () => {
  it('shows what was said with the state it was said in and what led up to it', () => {
    const text = timeline(log());
    expect(text).toContain('1:15 P2 said: "this cave is way too hard, email me at [email]"');
    expect(text).toContain('hero: lv2 hp 9/36 mp 8/12, blow 10 (6+4 gear), armor 3 (1+2 gear)');
    expect(text).toContain(
      'fights: knocked out 1x (1 in this zone), the party killed 5 here (9 in all); last 60s: took 31 damage in 3 hits (Orc x3)',
    );
    expect(text).toContain('last hurt by Orc 2s ago; DM pressure steady');
    expect(text).toContain('The Sunscar Hollow (14,30) levels 4\u20135, 7 of 12 foes alive');
    expect(text).toContain(
      'Orc x3 (2 near) hp 91 atk 24 def 3 xp 46: 13 blows to fell it, 2 hits to fell the hero [deadly; a typical hero of this level: fair]',
    );
    expect(text).toContain('party 2 avg 40% lowest 25%');
    expect(text).toContain('just before: 1:00 the party killed goblin x3');
    expect(text).not.toContain('bob@example.com');
  });

  it('keeps only the latest entries of a very long game', () => {
    const l = new ReportLog();
    for (let i = 0; i < MAX_ENTRIES + 20; i++) l.add(i, 'signal', 0, `s${i}`, state());
    const lines = timeline(l.all)
      .split('\n')
      .filter((x) => x.includes(' signal: '));
    expect(lines).toHaveLength(MAX_ENTRIES);
    expect(lines.at(-1)).toContain(`s${MAX_ENTRIES + 19}`);
  });

  it('counts the evening in plain facts', () => {
    expect(facts(game, log()).join('\n')).toMatch(/42 minutes, 2 players heard from \(P1, P2\); ended: everyone left/);
    expect(facts(game, log()).join('\n')).toContain('1 knockout(s) (The Sunscar Hollow 1)');
  });
});

describe('the analysis prompt', () => {
  it('asks for the sections of a prompt file, from the log, with the repo map', () => {
    const { system, prompt } = analysisPrompt(game, log());
    expect(system).toContain('never include names');
    for (const h of ['## Prompt for the next session', '## At a glance', '## Findings', '## What went well'])
      expect(prompt).toContain(h);
    expect(prompt).toContain('THE HOST LOG');
    expect(prompt).toContain('HOW TO READ THE NUMBERS');
    expect(prompt).toContain('verdict');
    expect(prompt).toContain('docs/dungeon-master.md');
  });
});

describe('writing the report', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  const good =
    '## Prompt for the next session\nDo it.\n## At a glance\nTough.\n## Findings\n### 1. Cave too hard (severity: high)\n- see https://x.io\n## What went well\n- fun';

  it('names the file by day and code', () => {
    expect(reportPath('/r', game)).toBe(path.join('/r', '2026-10-17-brave-otters.md'));
  });

  it('writes the model’s reading under a header, with the log after it, cut of links', async () => {
    const d = dir();
    const wrote = await writeReport(d, game, log(), () => Promise.resolve(good));
    expect(wrote?.how).toBe('haiku');
    const text = fs.readFileSync(wrote!.path, 'utf8');
    expect(text.startsWith('# Playtest report 2026-10-17, game brave-otters')).toBe(true);
    expect(text).toContain('analysed by Haiku');
    expect(text).toContain('### 1. Cave too hard');
    expect(text).toContain('[link]');
    expect(text).toContain('## Log');
    expect(text).not.toContain('https://x.io');
  });

  it('falls back to the rules’ file when the model fails, answers badly or is not there', async () => {
    for (const ask of [
      () => Promise.reject(new Error('claude was too slow')),
      () => Promise.resolve('Sorry, I cannot do that.'),
      null,
    ]) {
      const wrote = await writeReport(dir(), game, log(), ask);
      expect(wrote?.how).toBe('plain');
      const text = fs.readFileSync(wrote!.path, 'utf8');
      expect(text).toContain('## Prompt for the next session');
      expect(text).toContain('## What players said');
      expect(text).toContain('too hard');
      expect(text).toContain('no model answered');
    }
  });

  it('writes nothing for a game where nothing was noted', async () => {
    expect(await writeReport(dir(), game, [], () => Promise.resolve(good))).toBeNull();
  });

  it('knows a file of the right shape', () => {
    expect(looksRight(good)).toBe(true);
    expect(looksRight('## Findings only')).toBe(false);
    expect(plainReport(log())).toContain('Hard moments');
  });
});
