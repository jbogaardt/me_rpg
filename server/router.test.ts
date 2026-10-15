import { describe, expect, it } from 'vitest';
import { MockFallback, MockRouter } from './mocks';
import {
  CONFIDENCE,
  HOLD_REPLY,
  NO_ROAD,
  choiceQuestion,
  evaluateAction,
  readImprovised,
  type Road,
  type TableState,
} from './router';

const roads: Road[] = [
  { cue: 'frost/thaw', label: 'Into frost, over a thaw crossing', theme: 'frost', tags: ['cold', 'snow'] },
  { cue: 'desert/ford', label: 'Into sand, over a ford', theme: 'desert', tags: ['heat', 'dunes'] },
  { cue: 'swamp/bridge', label: 'Into the fen, over a bridge', theme: 'swamp', tags: ['bog', 'mist'] },
];
const table = (options: Road[] = roads): TableState => ({
  area: 'Greenwood',
  friends: [1],
  story: { title: 'The Long Road', placed: ['Greenwood'], total: 4, options, complete: false },
});
const mocks = () => ({ router: new MockRouter(() => roads), fallback: new MockFallback() });

describe('evaluateAction', () => {
  it('takes the road the router is sure of', async () => {
    const d = await evaluateAction(table(), 'I want to see the snow', mocks());
    expect(d).toMatchObject({ source: 'router', cue: 'frost/thaw' });
    expect(d.confidence).toBeGreaterThanOrEqual(CONFIDENCE);
  });

  it('asks the fallback when the router is unsure', async () => {
    const d = await evaluateAction(table(), 'I juggle three apples', mocks());
    expect(d.source).toBe('fallback');
    expect(d.cue).toBeNull();
    expect(d.confidence).toBeLessThan(CONFIDENCE);
    expect(d.reply).toContain('juggle');
  });

  it('never forces a lone road on an action that has nothing to do with it', async () => {
    const d = await evaluateAction(table(roads.slice(0, 1)), 'I juggle three apples', mocks());
    expect(d.source).toBe('fallback');
    expect(d.cue).toBeNull();
  });

  it('goes straight to the fallback when there is no road to choose', async () => {
    let asked = false;
    const router = { choose: () => ((asked = true), Promise.reject(new Error('unused'))) };
    const d = await evaluateAction(table([]), 'Let us move on', { router, fallback: new MockFallback() });
    expect(asked).toBe(false);
    expect(d).toMatchObject({ source: 'fallback', cue: null, confidence: null });
  });

  it('survives both services failing', async () => {
    const fail = () => Promise.reject(new Error('down'));
    const d = await evaluateAction(table(), 'snow', { router: { choose: fail }, fallback: { improvise: fail } });
    expect(d).toEqual({ source: 'silent', cue: null, reply: HOLD_REPLY, confidence: null });
  });

  it('ignores a confident pick that is not one of the roads', async () => {
    const router = { choose: () => Promise.resolve({ choice: 'made/up', confidence: 0.99, distribution: {} }) };
    const d = await evaluateAction(table(), 'snow', { router, fallback: new MockFallback() });
    expect(d.source).toBe('fallback');
  });
});

describe('choiceQuestion', () => {
  it('offers the roads by cue, with the action in the state', () => {
    const q = choiceQuestion(table(), 'hello')!;
    expect(q.options.map((o) => o.id)).toEqual([...roads.map((r) => r.cue), NO_ROAD]);
    expect(JSON.parse(q.state)).toMatchObject({ action: 'hello', area: 'Greenwood' });
  });
});

describe('readImprovised', () => {
  it('keeps a reply and drops a cue the page did not offer', () => {
    expect(readImprovised('{"reply":" Hm. ","cue":"nowhere"}', roads)).toEqual({ reply: 'Hm.', cue: null });
    expect(readImprovised({ reply: 'Go', cue: 'desert/ford' }, roads)).toEqual({ reply: 'Go', cue: 'desert/ford' });
  });

  it('refuses what is not a usable answer', () => {
    for (const bad of ['not json', '{}', '{"reply":""}', null, 42, { reply: 7 }])
      expect(readImprovised(bad, roads)).toBeNull();
  });
});
