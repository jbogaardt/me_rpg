import { describe, expect, it } from 'vitest';
import { ClaudeEpicWriter, type Ask } from './claude';
import { tellEpic } from './epics';

const want = { area: 'Glen', looks: [{ id: 'a', name: 'Smith' }], told: [], stock: [{ id: 's', title: 'S' }] };

describe('ClaudeEpicWriter', () => {
  it('states the length limits of the title, tagline, opening and ending in its prompt', async () => {
    const prompts: string[] = [];
    const ask: Ask = (_system, prompt) => (prompts.push(prompt), Promise.resolve('{"id":"x"}'));
    await new ClaudeEpicWriter(ask).write(want);
    expect(prompts[0]).toMatch(/"title" is 1 to 40.*"tagline" 1 to 100.*"opening" and "ending" 1 to 230/);
  });

  it('mends a refused saga once, sent the page’s complaint (through tellEpic)', async () => {
    const prompts: string[] = [];
    const answers = [
      '{"id":"bad","title":"","tagline":"","opening":"","ending":""}',
      '{"id":"good","title":"Good","tagline":"A tale","opening":"It begins.","ending":"It ends."}',
    ];
    const ask: Ask = (_system, prompt) => (prompts.push(prompt), Promise.resolve(answers.shift() ?? 'null'));
    const teller = {
      epic: (raw: unknown) =>
        Promise.resolve(
          (raw as { title: string }).title
            ? { ok: true, note: '' }
            : { ok: false, note: 'bad: a title, tagline, opening and ending (short) are needed' },
        ),
    };
    const told = await tellEpic(new ClaudeEpicWriter(ask), { teller, looks: [], stock: want.stock }, 'Glen', []);
    expect(told).toMatchObject({ id: 'good' });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Your last try was refused: bad: a title, tagline');
  });
});
