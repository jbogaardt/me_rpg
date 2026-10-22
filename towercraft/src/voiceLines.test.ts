import { describe, expect, it } from 'vitest';
import { DRAWN_RACES, RACE_IDS } from './sim/races';
import { VOICE_LINES, voiceFile } from './voiceLines';

describe('unit voice lines', () => {
  it('every unit of every race has a pick and a go line', () => {
    for (const race of Object.values(DRAWN_RACES)) {
      for (const unit of race.units) {
        const lines = VOICE_LINES[race.id][unit.id];
        expect(lines, `${race.id}/${unit.id}`).toBeDefined();
        expect(lines?.pick, `${race.id}/${unit.id} pick`).toBeTruthy();
        expect(lines?.go, `${race.id}/${unit.id} go`).toBeTruthy();
      }
    }
  });

  it('names no unit that does not exist in its race', () => {
    for (const id of RACE_IDS) {
      const units = new Set(DRAWN_RACES[id].units.map((u) => u.id));
      for (const unit of Object.keys(VOICE_LINES[id])) expect(units.has(unit), `${id}/${unit}`).toBe(true);
    }
  });

  it('keeps every line short enough to say in one breath', () => {
    for (const lines of Object.values(VOICE_LINES).flatMap((race) => Object.values(race))) {
      expect(lines.pick.length).toBeLessThanOrEqual(40);
      expect(lines.go.length).toBeLessThanOrEqual(40);
    }
  });

  it('puts each line in its own file under audio/voice', () => {
    expect(voiceFile('swarm', 'spearman', 'pick')).toBe('audio/voice/swarm-spearman-pick.wav');
  });
});
