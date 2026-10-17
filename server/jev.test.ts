import { describe, expect, it } from 'vitest';
import { JevReader, JevRouter, JevTagger, type SystemOne } from './jev';
import { HINTS, cardQuestion, type Card, type Table } from './router';

const table: Table = { area: 'Greenwood', friends: [], questing: false, story: null };
const card: Card = {
  kind: 'struggle',
  title: 'The party is struggling',
  note: 'They are hurt.',
  options: [
    { id: 'ease', label: 'Ease off' },
    { id: 'stay', label: 'Stay the course' },
  ],
};

/** A stand-in for the TypeSafe client: records the request and answers with the given label. */
function fake(answer: string, probabilities: Record<string, number>) {
  const sent: Parameters<SystemOne['systemOne']>[0][] = [];
  const client: SystemOne = {
    systemOne: (request) => {
      sent.push(request);
      return Promise.resolve({ answers: { next: { choice: answer, confidence: 0.85, probabilities } } });
    },
  };
  return { client, sent };
}

describe('JevRouter', () => {
  it('asks one choice over plain labels described by the options, and maps the answer back', async () => {
    const { client, sent } = fake('option_1', { option_1: 0.85, option_2: 0.15 });
    const answer = await new JevRouter(client).choose(cardQuestion(card, table));
    expect(answer).toEqual({
      choice: 'ease',
      confidence: 0.85,
      distribution: { ease: 0.85, stay: 0.15 },
    });
    const asked = sent[0]!.questions.next!;
    expect(asked.type).toBe('choice');
    expect(asked.criteria).toEqual({
      option_1: `Ease off: ${HINTS['struggle/ease']}`,
      option_2: `Stay the course: ${HINTS['struggle/stay']}`,
    });
    expect(sent[0]!.state).toMatchObject({ card: { kind: 'struggle' }, playerWords: null });
  });

  it('refuses an answer that is not one of the options', async () => {
    const { client } = fake('option_9', {});
    await expect(new JevRouter(client).choose(cardQuestion(card, table))).rejects.toThrow('not an option');
  });
});

describe('JevReader', () => {
  it('asks four independent questions in one request and scales the pressure to 0..1', async () => {
    const sent: { questions: Record<string, { type: string }> }[] = [];
    const client = {
      systemOne(request: { state: unknown; questions: Record<string, { type: string }> }) {
        sent.push(request);
        return Promise.resolve({
          answers: {
            pressure: { score: 3 },
            stalled: { noul: 0.1 },
            wantsWord: { noul: 0.8 },
            needsQuest: { noul: 0.9 },
          },
        });
      },
    };
    const read = await new JevReader(client).read({
      area: 'Greenwood',
      party: { players: 1, averageHealthPercent: 100, lowestHealthPercent: 100, fallen: 0 },
      progress: { questActive: false, secondsSinceQuestOffered: 60, secondsSinceDmSpoke: 60 },
    });
    expect(read).toEqual({ pressure: 0.75, stalled: 0.1, wantsWord: 0.8, needsQuest: 0.9 });
    expect(Object.keys(sent[0]!.questions)).toEqual(['pressure', 'stalled', 'wantsWord', 'needsQuest']);
    expect(sent[0]!.questions.pressure!.type).toBe('score');
  });
});

describe('JevTagger', () => {
  const entry = {
    t: 60,
    kind: 'said' as const,
    slot: 1,
    text: 'goblins are too easy now',
    state: {
      who: 'P2',
      level: 5,
      hp: 50,
      maxHp: 58,
      zone: 'greenwood',
      area: 'The Greenwood',
      at: [10, 10] as [number, number],
      quest: null,
      party: { size: 1, avgHp: 0.9, lowest: 0.9 },
      breather: false,
      stall: 0,
      recent: [],
    },
  };

  it('asks the kind and the severity in one request, with the words and the state as data', async () => {
    const sent: { state: unknown; questions: Record<string, { type: string; criteria?: unknown }> }[] = [];
    const client = {
      systemOne(request: (typeof sent)[number]) {
        sent.push(request);
        return Promise.resolve({
          answers: { kind: { choice: 'option_3', confidence: 0.82 }, severity: { score: 1.2 } },
        });
      },
    } as unknown as SystemOne;
    const tag = await new JevTagger(client).tag(entry);
    expect(tag).toEqual({ kind: 'too_easy', severity: 1, confidence: 0.82, by: 'jev' });
    expect(Object.keys(sent[0]!.questions)).toEqual(['kind', 'severity']);
    expect(sent[0]!.questions.kind!.type).toBe('choice');
    expect(sent[0]!.questions.severity!.type).toBe('score');
    expect(sent[0]!.state).toMatchObject({ playerWords: 'goblins are too easy now', player: { level: 5 } });
  });

  it('refuses an answer that is not a kind', async () => {
    const client = {
      systemOne: () =>
        Promise.resolve({ answers: { kind: { choice: 'option_99', confidence: 1 }, severity: { score: 0 } } }),
    } as unknown as SystemOne;
    await expect(new JevTagger(client).tag(entry)).rejects.toThrow('not an option');
  });
});
