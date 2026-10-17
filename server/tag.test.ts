import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '../src/systems/reportLog';
import { RulesTagger, tagEntry, type Tagger } from './tag';

const entry = (kind: ReportEntry['kind'], text: string): ReportEntry => ({
  t: 10,
  kind,
  slot: 1,
  text,
  state: {
    who: 'P2',
    level: 1,
    hp: 5,
    maxHp: 30,
    zone: 'z',
    area: 'A',
    at: [1, 1],
    quest: null,
    party: { size: 1, avgHp: 0.2, lowest: 0.2 },
    breather: false,
    stall: 0,
    recent: [],
  },
});

describe('tagging an entry', () => {
  const jev: Tagger = { tag: () => Promise.resolve({ kind: 'bug', severity: 3, confidence: 0.9, by: 'jev' }) };

  it('reads a canned ask or a face from what it says, not from the tagger', async () => {
    expect((await tagEntry(entry('ask', 'This is too hard'), jev))?.by).toBe('ask');
    expect((await tagEntry(entry('note', '\u{1F61E}'), jev))?.kind).toBe('other');
  });

  it('has the tagger read words', async () => {
    expect(await tagEntry(entry('said', 'the door is stuck'), jev)).toMatchObject({ kind: 'bug', by: 'jev' });
  });

  it('falls back to the rules when the tagger fails or is slow, and never rejects', async () => {
    const broken: Tagger = { tag: () => Promise.reject(new Error('no key')) };
    expect(await tagEntry(entry('said', 'way too hard'), broken)).toMatchObject({ kind: 'too_hard', by: 'rules' });
    const slow: Tagger = { tag: () => new Promise(() => undefined) };
    expect(await tagEntry(entry('said', 'so boring'), slow, 20)).toMatchObject({ kind: 'too_easy', by: 'rules' });
  });

  it('tags nothing that is not a player’s words', async () => {
    expect(await tagEntry(entry('down', 'knocked out'), jev)).toBeNull();
    expect(await tagEntry(entry('signal', 'struggle'), jev)).toBeNull();
  });

  it('has a keyword tagger that needs no key', async () => {
    expect((await new RulesTagger().tag(entry('said', 'where do I go')))?.kind).toBe('confusing');
  });
});
