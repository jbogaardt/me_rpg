import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { wayToGoal } from './wayText';

const at = (col: number, row: number) => ({ x: col * CELL, y: row * CELL });

describe('wayToGoal', () => {
  it('says which way from the player, in the same land', () => {
    const goal = { ...at(30, 5), zone: 'fen', title: 'Reach the Old Mill' };
    expect(wayToGoal(at(10, 20), 'fen', goal, null)).toBe(
      'Reach the Old Mill: it lies a good way to the north-east of you.',
    );
  });
  it('names both lands and the way out when the goal is elsewhere', () => {
    const goal = { ...at(0, 0), zone: 'fen', title: 'Reach the Old Mill' };
    const text = wayToGoal(at(10, 10), 'wood', goal, at(10, 30));
    expect(text).toContain('you are in');
    expect(text).toContain('and it is in');
    expect(text).toContain('The way on is');
    expect(text).toContain('south');
    expect(wayToGoal(at(10, 10), 'wood', goal, null)).not.toContain('The way on');
  });
});
