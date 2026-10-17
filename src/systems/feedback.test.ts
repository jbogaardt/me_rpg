import { describe, expect, it } from 'vitest';
import { REQUESTS } from './dmRequests';
import {
  ASK_LABELS_COVERED,
  COMPLAINTS,
  FEEDBACK_KINDS,
  FOLLOW_UP_EVERY,
  FOLLOW_UP_MAX,
  FOLLOW_UP_WORDS,
  KIND_MEANING,
  followUpFor,
  givenTag,
  newFollowUps,
  recordFollowUp,
  ruleTag,
} from './feedback';
import { MAX_SAY } from './dmPowers';

describe('the feedback vocabulary', () => {
  it('has a meaning for every kind and a meaning for every canned ask', () => {
    for (const k of FEEDBACK_KINDS) expect(KIND_MEANING[k].length).toBeGreaterThan(10);
    expect(ASK_LABELS_COVERED).toBe(true);
    for (const r of REQUESTS) expect(givenTag({ kind: 'ask', text: r.label })).not.toBeNull();
  });

  it('knows what a canned ask or a tapped face says without reading words', () => {
    expect(givenTag({ kind: 'ask', text: 'This is too hard' })).toMatchObject({
      kind: 'too_hard',
      confidence: 1,
      by: 'ask',
    });
    expect(givenTag({ kind: 'note', text: '\u{1F600}' })).toMatchObject({ kind: 'praise', severity: 0 });
    expect(givenTag({ kind: 'note', text: '\u{1F61E}' })).toMatchObject({ kind: 'other', severity: 1 });
    expect(givenTag({ kind: 'said', text: 'hello' })).toBeNull();
  });

  it('tags words by keyword when nothing better is there', () => {
    expect(ruleTag('this cave is way too hard').kind).toBe('too_hard');
    expect(ruleTag('goblins are too easy now, boring').kind).toBe('too_easy');
    expect(ruleTag('I fell through the floor, a glitch').kind).toBe('bug');
    expect(ruleTag('where do I go next?').kind).toBe('confusing');
    expect(ruleTag('nothing to do for ages').kind).toBe('pace');
    expect(ruleTag('I love the tavern').kind).toBe('praise');
    expect(ruleTag('can we have a boat').kind).toBe('request');
    expect(ruleTag('hmm').kind).toBe('other');
    expect(ruleTag('hmm').confidence).toBeLessThan(0.5);
  });

  it('grades how much it matters', () => {
    expect(ruleTag('the game crashes').severity).toBe(3);
    expect(ruleTag('a bit too easy').severity).toBe(1);
    expect(ruleTag('too hard').severity).toBe(2);
    expect(ruleTag('I love it').severity).toBe(0);
  });
});

describe('asking a vague complainer back', () => {
  const said = (text: string, t = 100, slot = 1) => ({ kind: 'said' as const, text, slot, t });
  const sure = { kind: 'too_hard' as const, severity: 2, confidence: 0.8, by: 'jev' as const };

  it('asks about a short, sure complaint, with wordings fit to be said', () => {
    expect(followUpFor(said('too hard'), sure, newFollowUps())).toBe('too_hard');
    for (const bank of Object.values(FOLLOW_UP_WORDS))
      for (const l of bank) expect(l.length).toBeLessThanOrEqual(MAX_SAY);
  });

  it('does not ask when they said enough, when unsure, or about praise', () => {
    expect(
      followUpFor(said('the orcs in the sunscar hollow kill me in two hits every time'), sure, newFollowUps()),
    ).toBeNull();
    expect(followUpFor(said('too hard'), { ...sure, confidence: 0.4 }, newFollowUps())).toBeNull();
    expect(followUpFor(said('nice'), { ...sure, kind: 'praise', severity: 0 }, newFollowUps())).toBeNull();
    expect(COMPLAINTS).not.toContain('praise');
  });

  it('asks a canned ask back (it has no words), and an unhappy face', () => {
    expect(followUpFor({ kind: 'ask', text: 'This is too hard', slot: 1, t: 5 }, sure, newFollowUps())).toBe(
      'too_hard',
    );
    expect(
      followUpFor(
        { kind: 'note', text: '\u{1F61E}', slot: 1, t: 5 },
        { kind: 'other', severity: 1, confidence: 0.9, by: 'ask' },
        newFollowUps(),
      ),
    ).toBe('other');
  });

  it('asks each player once in a while and only a few times a game', () => {
    const state = newFollowUps();
    recordFollowUp(state, 1, 100);
    expect(followUpFor(said('too hard', 100 + FOLLOW_UP_EVERY - 1), sure, state)).toBeNull();
    expect(followUpFor(said('too hard', 100 + FOLLOW_UP_EVERY), sure, state)).toBe('too_hard');
    expect(followUpFor(said('too hard', 150, 2), sure, state)).toBe('too_hard'); // another player
    for (let i = 0; i < FOLLOW_UP_MAX; i++) recordFollowUp(state, 10 + i, 0);
    expect(followUpFor(said('too hard', 9999, 2), sure, state)).toBeNull();
  });
});
