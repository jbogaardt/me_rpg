import { describe, expect, it } from 'vitest';
import type { QuestLog } from './combat';
import { gateNote, gateShut } from './gates';
import { QUESTS, type Quest } from './quests';

const quest = (id: string, opens?: Quest['opens']) => ({ id, opens }) as Quest;
const chain = [quest('a'), quest('b', [{ zone: 'z', gate: 'g', note: 'It opens' }]), quest('c')];
const log = (stage: number): QuestLog => ({ stage, taken: false, progress: 0 });

describe('gateShut', () => {
  it('keeps a gate shut until the step that opens it is handed in', () => {
    expect(gateShut(log(0), 'z', 'g', chain)).toBe(true);
    expect(gateShut(log(1), 'z', 'g', chain)).toBe(true); // on the step itself
    expect(gateShut(log(2), 'z', 'g', chain)).toBe(false); // handed in
  });

  it('never shuts a gate no step names, nor one of another zone', () => {
    expect(gateShut(log(0), 'z', 'other', chain)).toBe(false);
    expect(gateShut(log(0), 'elsewhere', 'g', chain)).toBe(false);
  });

  it('says what the step tells when it opens', () => {
    expect(gateNote('z', 'g', chain)).toBe('It opens');
    expect(gateNote('z', 'other', chain)).toBeNull();
  });
});

describe("campaign 1's story", () => {
  it('shuts the Old Lake and the Undercroft barricades at the start and opens them in the end', () => {
    expect(gateShut(log(0), 'greenwood', 'oldlake')).toBe(true);
    expect(gateShut(log(0), 'sewer_undercroft', 'barricade')).toBe(true);
    expect(gateShut(log(QUESTS.length), 'greenwood', 'oldlake')).toBe(false);
    expect(gateShut(log(QUESTS.length), 'sewer_undercroft', 'barricade')).toBe(false);
  });
});
