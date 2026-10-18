import { describe, expect, it } from 'vitest';
import {
  HUD_RULES,
  MAX_HEARTS,
  heartFills,
  heartLayout,
  heartsDim,
  lostHeart,
  manaDim,
  manaMoved,
  needBase,
  needDim,
  needMoved,
  newCaption,
  stepCaption,
  stepQuiet,
} from './hudRules';

describe('hearts', () => {
  it('draws one heart per 10 HP until there would be more than ten, then doubles', () => {
    expect(heartLayout(30)).toEqual({ per: 10, count: 3 });
    expect(heartLayout(34)).toEqual({ per: 10, count: 4 });
    expect(heartLayout(100)).toEqual({ per: 10, count: 10 });
    expect(heartLayout(101)).toEqual({ per: 20, count: 6 });
    expect(heartLayout(400)).toEqual({ per: 40, count: 10 });
    expect(heartLayout(401)).toEqual({ per: 80, count: 6 });
  });

  it('never draws more than the cap or fewer than one, whatever the max HP', () => {
    for (const max of [0, 1, 7, 30, 99, 100, 250, 999, 5000, 123456]) {
      const { count, per } = heartLayout(max);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(MAX_HEARTS);
      expect(count * per).toBeGreaterThanOrEqual(max);
    }
  });

  it('fills in quarters, rounding up so a sliver of HP still shows', () => {
    expect(heartFills(30, 30)).toEqual([4, 4, 4]);
    expect(heartFills(0, 30)).toEqual([0, 0, 0]);
    expect(heartFills(15, 30)).toEqual([4, 2, 0]);
    expect(heartFills(22, 30)).toEqual([4, 4, 1]);
    expect(heartFills(1, 30)).toEqual([1, 0, 0]);
    expect(heartFills(10.2, 30)).toEqual([4, 1, 0]);
  });

  it('scales the last heart to its own smaller capacity', () => {
    expect(heartFills(35, 35)).toEqual([4, 4, 4, 4]);
    expect(heartFills(32, 35)).toEqual([4, 4, 4, 2]);
  });

  it('keeps the fills monotone: more HP never shows less', () => {
    for (const max of [30, 36, 84, 137, 400]) {
      let last = -1;
      for (let hp = 0; hp <= max; hp++) {
        const sum = heartFills(hp, max).reduce((a, b) => a + b, 0);
        expect(sum).toBeGreaterThanOrEqual(last);
        last = sum;
      }
    }
  });

  it('finds the heart that lost HP (the last one that dropped)', () => {
    expect(lostHeart([4, 4, 4], [4, 4, 2])).toBe(2);
    expect(lostHeart([4, 4, 1], [4, 2, 0])).toBe(2);
    expect(lostHeart([4, 4, 4], [4, 4, 4])).toBe(-1);
    expect(lostHeart([4, 2, 0], [4, 4, 0])).toBe(-1); // healing pops nothing
  });
});

describe('the quiet HUD', () => {
  it('resets the quiet clock on any change and counts up otherwise', () => {
    expect(stepQuiet(2, 0.5, false)).toBe(2.5);
    expect(stepQuiet(2, 0.5, true)).toBe(0);
  });

  it('fades the hearts only when calm (60% or more) and quiet for 3 s', () => {
    expect(heartsDim(HUD_RULES.idle, 30, 30)).toBe(true);
    expect(heartsDim(HUD_RULES.idle - 0.1, 30, 30)).toBe(false);
    expect(heartsDim(10, 18, 30)).toBe(true); // exactly 60%
    expect(heartsDim(10, 17, 30)).toBe(false);
    expect(heartsDim(10, 11, 30)).toBe(false); // below 40%
    expect(heartsDim(10, 1, 30)).toBe(false);
  });

  it('shows mana while low (under 25%) or for 3 s after a spend', () => {
    expect(manaDim(0, 20, 20)).toBe(false);
    expect(manaDim(3, 20, 20)).toBe(true);
    expect(manaDim(30, 4, 20)).toBe(false);
    expect(manaDim(30, 5, 20)).toBe(true);
  });

  it('counts a spend or a gulp as a mana change, not the slow regeneration', () => {
    expect(manaMoved(10, 9, 20)).toBe(true);
    expect(manaMoved(10, 11, 20)).toBe(false);
    expect(manaMoved(10, 12, 20)).toBe(true);
  });

  it('fades a need unless it is low, and notices a bite or a drink', () => {
    expect(needDim(5, false)).toBe(true);
    expect(needDim(5, true)).toBe(false);
    expect(needDim(1, false)).toBe(false);
    expect(needMoved(50, 51)).toBe(false);
    expect(needMoved(50, 60)).toBe(true);
  });

  it('notices a steady drink after 5 points, and follows the slow drain down', () => {
    let base = 40;
    let moved = false;
    for (let v = 40; v <= 47; v += 1) {
      moved ||= needMoved(base, v);
      base = needBase(base, v);
    }
    expect(moved).toBe(true);
    expect(needBase(60, 59.5)).toBe(59.5);
    expect(needMoved(needBase(60, 59.5), 59.4)).toBe(false);
  });
});

describe('the waypoint caption', () => {
  const run = (s: ReturnType<typeof newCaption>, seconds: number, moved: boolean, key: string, blocked = false) => {
    for (let t = 0; t < seconds; t += 1 / 60) stepCaption(s, 1 / 60, moved, key, blocked);
  };

  it('stays away while the hero walks, shows after a second standing still, and leaves when they move', () => {
    const s = newCaption();
    run(s, 0.1, true, 'Maren, east'); // a newly active target shows it first...
    const s2 = newCaption();
    s2.key = 'Maren, east'; // ...so look at one already known
    run(s2, 5, true, 'Maren, east');
    expect(s2.alpha).toBe(0);
    run(s2, 0.9, false, 'Maren, east');
    expect(s2.alpha).toBe(0);
    run(s2, 0.6, false, 'Maren, east');
    expect(s2.alpha).toBe(1);
    run(s2, 0.5, true, 'Maren, east');
    expect(s2.alpha).toBe(0);
    expect(s.alpha).toBeGreaterThan(0);
  });

  it('shows for a newly active target even while walking, then goes', () => {
    const s = newCaption();
    run(s, 1, true, 'Door, north');
    expect(s.alpha).toBe(1);
    run(s, HUD_RULES.captionNew + 1, true, 'Door, north');
    expect(s.alpha).toBe(0);
  });

  it('is never shown without a target or over a name label', () => {
    const s = newCaption();
    run(s, 3, false, '');
    expect(s.alpha).toBe(0);
    run(s, 3, false, 'Maren', true);
    expect(s.alpha).toBe(0);
  });

  it('fades in and out rather than jumping', () => {
    const s = newCaption();
    s.key = 'Maren'; // already known, so only standing still brings it up
    run(s, 1.1, false, 'Maren');
    expect(s.alpha).toBeGreaterThan(0);
    expect(s.alpha).toBeLessThan(1);
  });
});
