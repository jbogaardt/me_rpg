import { describe, expect, it } from 'vitest';
import { JevRouter, type SystemOne } from './jev';
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
    const asked = sent[0]!.questions.next;
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
