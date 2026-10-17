import { describe, expect, it } from 'vitest';
import { MockFallback, MockRouter } from './mocks';
import {
  CONFIDENCE_CARD,
  HINTS,
  HOLD_REPLIES,
  NONE,
  isRepeat,
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
  it('takes the road the writer picks for a friend', async () => {
    const m = await decideCard(message('lets move on to the snow'), table(), mocks());
    expect(m).toMatchObject({ source: 'fallback', road: 'frost/thaw', pick: null });
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
    const held = await decideCard(message('hello'), table(), services);
    expect(held.source).toBe('silent');
    expect(HOLD_REPLIES).toContain(held.reply);
    expect(await decideCard(struggle, table(), services)).toMatchObject({ source: 'safe', pick: 'stay', reply: null });
  });

  it('ignores a confident pick that was not offered', async () => {
    const router = { choose: () => Promise.resolve({ choice: 'made/up', confidence: 0.99, distribution: {} }) };
    const m = await decideCard(struggle, table(), { router, fallback: new MockFallback() });
    expect(m).toMatchObject({ source: 'safe', pick: 'stay' }); // a guess is not acted on: the card's own do-nothing
  });
});

describe('an unsure pick on a director card does the safe thing (beta log: 18% "Turn up the heat")', () => {
  const card = (kind: string, ...ids: string[]): Card => ({
    kind,
    title: kind,
    note: '',
    options: ids.map((id) => ({ id, label: id })),
  });
  const unsure = (confidence: number) => ({
    choose: (q: { options: { id: string }[] }) =>
      Promise.resolve({ choice: q.options[0]!.id, confidence, distribution: {} }),
  });
  const asks = () => {
    const fallback = writer({ pick: 'heat' });
    return { fallback, services: (c: number) => ({ router: unsure(c), fallback }) };
  };

  it("takes the card's own stay-the-course instead of a low-confidence heat", async () => {
    for (const c of [0.16, 0.18, 0.22, 0.25, CONFIDENCE_CARD - 0.01]) {
      const { fallback, services } = asks();
      const easy = card('easy', 'heat', 'stay');
      expect(await decideCard(easy, table(), services(c))).toMatchObject({ source: 'safe', pick: 'stay', road: null });
      expect(fallback.asked).toHaveLength(0); // the writer is not asked to improvise a world change either
    }
    for (const [kind, ids] of [
      ['struggle', ['ease', 'stay']],
      ['lost', ['hint', 'stay']],
      ['done', ['heat', 'stay']],
    ] as const)
      expect(await decideCard(card(kind, ...ids), table(), asks().services(0.2))).toMatchObject({ pick: 'stay' });
  });

  it('lets a fallen friend wake at the start rather than guessing a revive', async () => {
    const revive = card('revive', 'where:1', 'here:1', 'leave:1');
    expect(await decideCard(revive, table(), asks().services(0.2))).toMatchObject({ source: 'safe', pick: 'leave:1' });
  });

  it('does nothing on a card with no do-nothing option that changes the world', async () => {
    for (const c of [
      card('twist', 'close', 't:23'),
      card('pressure', 'gentle', 'hard'),
      card('epic', 'e:0', 'e:1'),
      card('next', 'e:0'),
      card('suggest', 's:epic'),
    ])
      expect(await decideCard(c, table(), asks().services(0.2))).toMatchObject({
        source: 'safe',
        pick: null,
        road: null,
      });
  });

  it('still lets the writer choose where the story goes or how the sky looks', async () => {
    const fallback = writer({ pick: 'frost/thaw' });
    const story = card('story', 'frost/thaw', 'desert/ford');
    expect(await decideCard(story, table(), { router: unsure(0.2), fallback })).toMatchObject({
      source: 'fallback',
      pick: 'frost/thaw',
    });
  });

  it('treats a down router like an unsure one', async () => {
    const router = { choose: () => Promise.reject(new Error('down')) };
    const m = await decideCard(card('easy', 'heat', 'stay'), table(), { router, fallback: writer({ pick: 'heat' }) });
    expect(m).toMatchObject({ source: 'safe', pick: 'stay' });
  });

  it('still takes a sure pick', async () => {
    const m = await decideCard(card('easy', 'heat', 'stay'), table(), asks().services(CONFIDENCE_CARD));
    expect(m).toMatchObject({ source: 'router', pick: 'heat' });
  });
});

describe('cardQuestion', () => {
  it('offers a message card its options, the roads and none, never the canned replies', () => {
    const ids = cardQuestion(message('hi'), table()).options.map((o) => o.id);
    expect(ids).toEqual(['@quest', 'ease', 'heat', 'hint', ...roads.map((r) => `road:${r.cue}`), NONE]);
  });

  it('offers a director card no roads', () => {
    expect(cardQuestion(struggle, table()).options.map((o) => o.id)).toEqual(['ease', 'stay']); // a card's own "stay" is its way to do nothing
  });
});

describe("how a director's card is asked", () => {
  it("describes each choice by when it is right, and gives the party's health", () => {
    const q = cardQuestion(struggle, table());
    expect(q.options.map((o) => o.hint)).toEqual([HINTS['struggle/ease'], HINTS['struggle/stay']]);
    expect(q.state.party).toMatchObject({ average: 1, lowest: 1 });
    expect(q.state.table).not.toHaveProperty('friends'); // the router is not shown slots or offsets
  });

  it('sums the party up', () => {
    const t = { ...table(), friends: [1, 0.5, 0.2].map((hp, slot) => ({ slot, area: 'A', hp, near: true })) };
    expect(partyHealth(t)).toEqual({ average: 0.57, lowest: 0.2, players: 3 });
    expect(partyHealth({ ...t, friends: [] })).toEqual({ average: 1, lowest: 1, players: 0 });
  });

  it("takes a router pick a little above a coin toss for a card; a player's words skip it", async () => {
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
    expect(asked.source).toBe('fallback'); // typed words never go to the router
    const unsure = await decideCard(struggle, table(), { router: sure(CONFIDENCE_CARD - 0.1), fallback });
    expect(unsure.source).toBe('safe');
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

describe("a player's words may ask for what the bar can do", () => {
  it('turns "too many" into easing off, in plain words', () => {
    const ids = cardQuestion(message('too many mobs'), table()).options.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['ease', 'heat', 'hint']));
  });
});

/** A router that always picks `choice` with full confidence, and counts its calls. */
const jev = (choice: string) => {
  const calls: number[] = [];
  return {
    calls,
    choose: () => (calls.push(1), Promise.resolve({ choice, confidence: 0.99, distribution: {} })),
  };
};
/** A writer that answers with each of `answers` in turn (the last repeats), and records what it was asked. */
const writer = (...answers: unknown[]) => {
  const asked: { recent?: string[]; refused?: string }[] = [];
  return {
    asked,
    improvise: (req: { recent?: string[]; refused?: string }) => {
      asked.push(req);
      return Promise.resolve(answers[Math.min(asked.length - 1, answers.length - 1)]);
    },
  };
};

describe('a typed request always reaches the writer (#36)', () => {
  it('sends the words to the writer and the reply on, whatever Jev would have said', async () => {
    for (const choice of [NONE, 'ease', 'road:frost/thaw']) {
      const router = jev(choice);
      const fallback = writer({ reply: 'The Pinefold lies north, past the mill.' });
      const m = await decideCard(message('WHERE IS THE PINEFOLD'), table(), { router, fallback });
      expect(fallback.asked).toHaveLength(1);
      expect(router.calls).toHaveLength(0);
      expect(m).toMatchObject({ source: 'fallback', reply: 'The Pinefold lies north, past the mill.', pick: null });
    }
  });

  it('never leaves a player unanswered, even when the writer gives only a pick or fails', async () => {
    const picked = await decideCard(message('im stuck'), table(), {
      router: jev(NONE),
      fallback: writer({ pick: 'hint' }),
    });
    expect(picked.reply).toBeTruthy();
    const failed = await decideCard(message('im stuck'), table(), {
      router: jev(NONE),
      fallback: { improvise: () => Promise.reject(new Error('down')) },
    });
    expect(HOLD_REPLIES).toContain(failed.reply);
  });

  it('still lets Jev handle a card with no player words', async () => {
    const router = jev('ease');
    const m = await decideCard(struggle, table(), { router, fallback: writer({}) });
    expect(router.calls).toHaveLength(1);
    expect(m).toMatchObject({ source: 'router', pick: 'ease', reply: null });
  });
});

describe('a card with no options skips Jev (#38)', () => {
  it('does not ask the router a choice with no criteria', async () => {
    const router = jev('x');
    const empty: Card = { kind: 'epic', title: 'An epic quest is running', note: '', options: [] };
    const m = await decideCard(empty, table(), { router, fallback: writer({ pick: 'x' }) });
    expect(router.calls).toHaveLength(0);
    expect(m).toMatchObject({ source: 'silent', pick: null, reply: null });
  });
});

describe('a running epic is answered from, never replaced (#40)', () => {
  const running = { ...table(), questing: true, epicNow: { title: 'The Drowned Lamp', step: 2, total: 4 } };
  it('does not offer "give them a quest" while an epic runs', () => {
    expect(cardQuestion(message('what is my quest'), table()).options.map((o) => o.id)).toContain('@quest');
    expect(cardQuestion(message('what is my quest'), running).options.map((o) => o.id)).not.toContain('@quest');
  });

  it('hands the writer the running epic, and answers from it when the writer only guesses', async () => {
    const fallback = writer({ reply: 'Something about quests.', pick: '@quest', sure: 0.2 });
    const m = await decideCard(
      message('what is my quest DM'),
      { ...running, task: 'Find the lamp' },
      { router: jev(NONE), fallback },
    );
    expect(cardQuestion(message('x'), running).state.table.epic).toEqual(running.epicNow);
    expect(m.reply).toContain('The Drowned Lamp');
    expect(m.reply).toContain('chapter 2 of 4');
  });
});

describe('the writer is not allowed to repeat itself or guess (#41)', () => {
  it('spots near-duplicate replies', () => {
    const old = ['The drowned priest left grey ash on the altar steps.'];
    expect(isRepeat('The drowned priest left grey ash upon the altar steps!', old)).toBe(true);
    expect(isRepeat('Take the east road to the mill.', old)).toBe(false);
    expect(isRepeat('', old)).toBe(false);
    expect(isRepeat('anything at all', [])).toBe(false);
  });

  it('asks again once with the recent lines and the reason, and sends the better answer', async () => {
    const recent = ['The drowned priest left grey ash on the altar steps.'];
    const fallback = writer(
      { reply: 'The drowned priest left grey ash on the altar.' },
      { reply: 'Cross the bridge, the shrine is past the mill.' },
    );
    const m = await decideCard(message('where do I go'), table(), { router: jev(NONE), fallback }, recent);
    expect(fallback.asked.map((a) => a.recent)).toEqual([recent, recent]);
    expect(fallback.asked[1]?.refused).toContain('repeats');
    expect(m.reply).toBe('Cross the bridge, the shrine is past the mill.');
  });

  it('falls back to a plain answer when it repeats twice, and never sends "Follow the way"', async () => {
    const recent = ['Grey ash lies on the altar steps.'];
    const stuck = writer({ reply: 'Grey ash lies on the altar steps.' });
    const again = await decideCard(
      message('hm'),
      { ...table(), task: 'Clear the mill' },
      { router: jev(NONE), fallback: stuck },
      recent,
    );
    expect(again.reply).toBe('Your task now: Clear the mill');
    const banned = writer({ reply: 'Follow the way, friend.' });
    const m = await decideCard(message('hm'), table(), { router: jev(NONE), fallback: banned });
    expect(banned.asked).toHaveLength(2);
    expect(m.reply).not.toMatch(/follow the way/i);
  });

  it('does not send a low-confidence guess as an answer', async () => {
    const fallback = writer(
      { reply: 'You want the Kettle Hat.', sure: 0.33 },
      { reply: 'Which P2 do you mean?', sure: 0.9 },
    );
    const m = await decideCard(message('point me to P2'), table(), { router: jev(NONE), fallback });
    expect(m.reply).toBe('Which P2 do you mean?');
  });
});
