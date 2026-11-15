import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PACE, applyDifficulty, createAi } from './ai';
import { BOARDS } from './board';
import { newMatch, step } from './sim';
import { checksum } from '../net/lockstep';

const play = (level: 'easy' | 'normal' | 'hard' | undefined, ticks: number) => {
  const m = newMatch(['legion', 'swarm'], BOARDS['greenwood']);
  if (level) applyDifficulty(m, 0, 1, level);
  const ais = [createAi(0, 5), createAi(1, 6, undefined, level)];
  for (let i = 0; i < ticks; i++) {
    for (const a of ais) a(m, 0.05);
    step(m, 0.05);
  }
  return m;
};

describe('solo difficulty', () => {
  it('normal is exactly the computer without a level', () => {
    expect(checksum(play('normal', 4000))).toBe(checksum(play(undefined, 4000)));
  });
  it('changes what the computers against you earn, never your own seat', () => {
    const m = newMatch(['legion', 'swarm'], BOARDS['greenwood']);
    const [mine, theirs] = [m.players[0].pace, m.players[1].pace];
    applyDifficulty(m, 0, 1, 'hard');
    expect(m.players[0].pace).toBe(mine);
    expect(m.players[1].pace).toBeCloseTo(theirs * DIFFICULTY_PACE.hard);
  });
  it('easy and hard play differently from normal, deterministically', () => {
    const [e, n, h] = [play('easy', 4000), play('normal', 4000), play('hard', 4000)];
    expect(checksum(e)).not.toBe(checksum(n));
    expect(checksum(h)).not.toBe(checksum(n));
    expect(checksum(play('easy', 4000))).toBe(checksum(e));
  });
});
