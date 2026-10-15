import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinStory, splitStory, type Json } from '../../src/content/story';
import { CONTENT_DIR } from './disk';

const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')) as Json;
const onDisk = (campaign: string) =>
  JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, campaign, 'quests.json'), 'utf8')) as Json;

describe('a campaign story as one epic file', () => {
  for (const campaign of ['campaign1', 'campaign2']) {
    const flat = fixture(`${campaign}.quests.v1.json`);

    it(`${campaign}: the flat file and the epic form compile to each other, losing nothing`, () => {
      const joined = joinStory(flat, { id: 'story', title: 'Story' });
      const back = splitStory(joined);
      expect(back.problems).toEqual([]);
      expect(back.quests).toEqual(flat);
    });

    it(`${campaign}: the file in the repo says exactly what the flat file said`, () => {
      const file = onDisk(campaign);
      expect(file.epics).toBeDefined(); // migrated
      const split = splitStory(file);
      expect(split.problems).toEqual([]);
      expect(split.quests).toEqual(flat);
    });
  }

  it('passes a flat file through untouched (random and live worlds still write one)', () => {
    const flat = fixture('campaign2.quests.v1.json');
    expect(splitStory(flat)).toEqual({ quests: flat, epics: [], problems: [] });
  });

  it('says what is wrong with the shape: no story, two stories, a bad scope, steps that are not a list', () => {
    const flat = fixture('campaign2.quests.v1.json');
    const joined = joinStory(flat, { id: 's', title: 'S' });
    const story = (joined.epics as Json[])[0];
    const problems = (epics: unknown) => splitStory({ ...joined, epics }).problems.join('|');
    expect(problems([])).toContain('exactly one epic');
    expect(problems([story, story])).toContain('found 2');
    expect(problems([{ ...story, scope: 'world' }])).toContain('scope');
    expect(problems([{ ...story, chapters: [{ title: 'x', intro: [], steps: 'no' }] }])).toContain('steps');
    expect(problems('no')).toContain('epics: must be an array');
  });

  it('keeps party epics apart from the story, for the Dungeon Master', () => {
    const flat = fixture('campaign2.quests.v1.json');
    const party = { id: 'saga', title: 'Saga' };
    const split = splitStory(
      joinStory(flat, { id: 's', title: 'S' }, [party, { ...party, id: 'two', scope: 'party' }]),
    );
    expect(split.epics).toHaveLength(2);
    expect(split.quests).toEqual(flat);
  });
});
