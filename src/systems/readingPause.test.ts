import { describe, expect, it } from 'vitest';
import { MAX_READ_S, ReadingPause } from './readingPause';

describe('ReadingPause', () => {
  it('holds the world while anyone reads, and lets go once all are done', () => {
    const p = new ReadingPause();
    expect(p.update([], 0.1)).toBe(false);
    expect(p.update([1, 2], 0.1)).toBe(true);
    expect(p.update([2], 0.1)).toBe(true);
    expect(p.update([], 0.1)).toBe(false);
  });

  it('stops holding for someone who sits on the box, but not for a friend who is still reading', () => {
    const p = new ReadingPause();
    for (let t = 0; t < MAX_READ_S; t++) p.update([1], 1);
    expect(p.update([1], 1)).toBe(false);
    expect(p.update([1, 2], 1)).toBe(true); // a second reader starts a fresh clock
    p.update([], 1);
    expect(p.update([1], 1)).toBe(true); // closing the box and reading again starts over
  });
});
