import { describe, expect, it } from 'vitest';
import { MockFallback, MockRouter } from './mocks';
import {
  CONFIDENCE,
  CONFIDENCE_CARD,
  HINTS,
  HOLD_REPLY,
  NONE,
  cardQuestion,
  decideCard,
  partyHealth,
  readImprovised,
  wordsOf,
  type Card,
  type Road,
  type Table,
} from './router';

const roads: Road[] = [
  { cue: 'frost/thaw', label: 'Into frost, over a thaw crossing', theme: 'frost', tags: ['cold', 'snow'] },
  { cue: 'desert/ford', label: 'Into sand, over a ford', theme: 'desert', tags: ['heat', 'dunes'] },
  { cue: 'swamp/bridge', label: 'Into the fen, over a bridge', theme: 'swamp', tags: ['bog', 'mist'] },
];
const table = (options: Road[] = roads): Table => ({
  area: 'Greenwood',
  friends: [{ slot: 1, area: 'Greenwood', hp: 1, near: true }],
  questing: false,
  story: { title: 'The Long Road', placed: ['Greenwood'], total: 4, options, complete: false },
});
/** A friend's own words, as the page puts them on a card. */
const message = (text: string): Card => ({
  kind: 'message',
  title: 'Player 2 says',
  note: `“${text}”`,
  options: [
    { id: 'r:0', label: 'Reply: On my way.' },
    { id: '@quest', label: 'Give them a quest' },
  ],
});
const struggle: Card = {
  kind: 'struggle',
  title: 'The party is struggling',
  note: 'They are hurt.',
  options: [
    { id: 'ease', label: 'Ease off' },
    { id: 'stay', label: 'Stay the course' },
  ],
};
const mocks = () => ({ router: new MockRouter(() => roads), fallback: new MockFallback() });

describe('decideCard', () => {
  it('takes the road a friend asks for when the router is sure', async () => {
    const m = await decideCard(message('I want to see the snow'), table(), mocks());
    expect(m).toMatchObject({ source: 'router', road: 'frost/thaw', pick: null });
    expect(m.confidence).toBeGreaterThanOrEqual(CONFIDENCE);
    expect(m.reply).toContain('frost');
  });

  it('improvises a reply when nothing fits the words', async () => {
    const m = await decideCard(message('I juggle three apples'), table(), mocks());
    expect(m).toMatchObject({ source: 'fallback', pick: null, road: null });
    expect(m.reply).toContain('juggle');
  });

  it('never forces a lone road on words that have nothing to do with it', async () => {
    const m = await decideCard(message('I juggle three apples'), table(roads.slice(0, 1)), mocks());
    expect(m.road).toBeNull();
  });

  it('hands out a quest when asked for one', async () => {
    expect(await decideCard(message('Give us a quest'), table([]), mocks())).toMatchObject({ pick: '@quest' });
    // words the router cannot place: the fallback still hears "task"
    expect(await decideCard(message('Any task for us'), table([]), mocks())).toMatchObject({
      source: 'fallback',
      pick: '@quest',
    });
  });

  it('answers a director card with an option and no reply', async () => {
    expect(await decideCard(struggle, table(), mocks())).toMatchObject({ source: 'router', pick: 'ease', reply: null });
  });

  it('survives both services failing', async () => {
    const fail = () => Promise.reject(new Error('down'));
    const services = { router: { choose: fail }, fallback: { improvise: fail } };
    expect(await decideCard(message('hello'), table(), services)).toMatchObject({
      source: 'silent',
      reply: HOLD_REPLY,
    });
    expect(await decideCard(struggle, table(), services)).toMatchObject({ source: 'silent', pick: null, reply: null });
  });

  it('ignores a confident pick that was not offered', async () => {
    const router = { choose: () => Promise.resolve({ choice: 'made/up', confidence: 0.99, distribution: {} }) };
    const m = await decideCard(struggle, table(), { router, fallback: new MockFallback() });
    expect(m).toMatchObject({ source: 'fallback', pick: 'ease' });
  });
});

describe('cardQuestion', () => {
  it('offers a message card its options, the roads and none, never the canned replies', () => {
    const ids = cardQuestion(message('hi'), table()).options.map((o) => o.id);
    expect(ids).toEqual(['@quest', ...roads.map((r) => `road:${r.cue}`), NONE]);
  });

  it('offers a director card no roads', () => {
    expect(cardQuestion(struggle, table()).options.map((o) => o.id)).toEqual(['ease', 'stay']); // a card's own "stay" is its way to do nothing
  });
});

describe("how a director's card is asked", () => {
  it("describes each choice by when it is right, and gives the party's health", () => {
    const q = cardQuestion(struggle, table());
    expect(q.options.map((o) => o.hint)).toEqual([HINTS['struggle/ease'], HINTS['struggle/stay']]);
    expect(q.state.party).toEqual({ average: 1, lowest: 1 });
  });

  it('sums the party up', () => {
    const t = { ...table(), friends: [1, 0.5, 0.2].map((hp, slot) => ({ slot, area: 'A', hp, near: true })) };
    expect(partyHealth(t)).toEqual({ average: 0.57, lowest: 0.2 });
    expect(partyHealth({ ...t, friends: [] })).toEqual({ average: 1, lowest: 1 });
  });

  it("takes a router pick a little above a coin toss for a card, but not for a player's words", async () => {
    const sure = (p: number) => ({
      choose: (q: { options: { id: string }[] }) =>
        Promise.resolve({ choice: q.options[0]!.id, confidence: p, distribution: {} }),
    });
    const fallback = new MockFallback();
    const card = await decideCard(struggle, table(), { router: sure(CONFIDENCE_CARD + 0.01), fallback });
    expect(card.source).toBe('router');
    const asked = await decideCard(message('I juggle three apples'), table(), {
      router: sure(CONFIDENCE_CARD + 0.01),
      fallback,
    });
    expect(asked.source).toBe('fallback');
    const unsure = await decideCard(struggle, table(), { router: sure(CONFIDENCE_CARD - 0.1), fallback });
    expect(unsure.source).toBe('fallback');
  });
});

describe('wordsOf', () => {
  it('reads a friend’s words or ask off the card', () => {
    expect(wordsOf(message('Hello there'))).toBe('Hello there');
    expect(wordsOf({ ...struggle, note: 'Player 2 asked: we are lost.' })).toBe('we are lost');
    expect(wordsOf(struggle)).toBeNull();
  });
});

describe('readImprovised', () => {
  const options = cardQuestion(struggle, table()).options;
  it('keeps what was offered and drops what was not', () => {
    expect(readImprovised('{"reply":" Hm. ","pick":"nowhere"}', options)).toEqual({ reply: 'Hm.', pick: null });
    expect(readImprovised({ pick: 'ease' }, options)).toEqual({ pick: 'ease', reply: null });
    expect(readImprovised({ pick: NONE }, options)).toEqual({ pick: null, reply: null });
  });

  it('refuses what is not a usable answer', () => {
    for (const bad of ['not json', '{}', '{"reply":""}', null, 42, { reply: 7 }, { pick: 'nowhere' }])
      expect(readImprovised(bad, options)).toBeNull();
  });
});
