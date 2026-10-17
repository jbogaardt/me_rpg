import { describe, expect, it } from 'vitest';
import epicsJson from './epics.json';
import { parseEpics } from '../systems/dmEpics';

describe('the DM sagas', () => {
  const epics = parseEpics(epicsJson);

  it('all parse', () => {
    expect(typeof epics).toBe('object');
  });

  it('are told, not listed: most steps of every saga turn the tale with an aftermath', () => {
    if (typeof epics === 'string') throw new Error(epics);
    for (const e of epics) {
      const told = e.steps.filter((s) => s.aftermath?.length || s.kind === 'meet').length;
      expect(told / e.steps.length, `${e.id} is a list of errands`).toBeGreaterThanOrEqual(0.5);
    }
  });
});
