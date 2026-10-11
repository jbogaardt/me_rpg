import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, eventInView, fitEvents, IDLE_RESEND, MIN_EVENT_ROOM, MobFeed, VIEW_MARGIN } from './feed';
import { encodeEvent, type EventWire, type MobFields } from './protocol';

const still = (x: number, y: number): MobFields => [x, y, 0, 0, 10, 0, 0];
const viewer = { x: 0, y: 0 };

describe('MobFeed', () => {
  it('tells a friend about nearby mobs, with their index in the map, and nobody else', () => {
    const feed = new MobFeed();
    const near = still(100, 100);
    const far = still(DEFAULT_VIEW + VIEW_MARGIN + 50, 0);
    expect(feed.select([far, near], viewer, DEFAULT_VIEW, 0)).toEqual([[1, ...near]]);
  });

  it('repeats a still mob only now and then', () => {
    const feed = new MobFeed();
    const mobs = [still(50, 50)];
    expect(feed.select(mobs, viewer, DEFAULT_VIEW, 0)).toHaveLength(1);
    expect(feed.select(mobs, viewer, DEFAULT_VIEW, 0.04)).toHaveLength(0);
    expect(feed.select(mobs, viewer, DEFAULT_VIEW, IDLE_RESEND - 0.01)).toHaveLength(0);
    expect(feed.select(mobs, viewer, DEFAULT_VIEW, IDLE_RESEND + 0.01)).toHaveLength(1);
  });

  it('sends a mob at once when anything about it changes', () => {
    const feed = new MobFeed();
    feed.select([still(50, 50)], viewer, DEFAULT_VIEW, 0);
    const moved: MobFields = [52, 50, 0, 0, 10, 0, 1];
    expect(feed.select([moved], viewer, DEFAULT_VIEW, 0.04)).toEqual([[0, ...moved]]);
    const hurt: MobFields = [52, 50, 0, 3, 4, 300, 0];
    expect(feed.select([hurt], viewer, DEFAULT_VIEW, 0.08)).toEqual([[0, ...hurt]]);
  });

  it('forgets a mob that leaves, so it is told in full when it returns', () => {
    const feed = new MobFeed();
    const mob = still(50, 50);
    feed.select([mob], viewer, DEFAULT_VIEW, 0);
    expect(feed.select([mob], { x: 5000, y: 5000 }, DEFAULT_VIEW, 0.04)).toHaveLength(0);
    expect(feed.select([mob], viewer, DEFAULT_VIEW, 0.08)).toHaveLength(1);
  });

  it('follows the view the friend asked for', () => {
    const feed = new MobFeed();
    const far = still(1500, 0);
    expect(feed.select([far], viewer, DEFAULT_VIEW, 0)).toHaveLength(0);
    expect(feed.select([far], viewer, 1400, 0)).toHaveLength(1);
  });

  it('keeps one memory per friend', () => {
    const [a, b] = [new MobFeed(), new MobFeed()];
    const mobs = [still(50, 50)];
    a.select(mobs, viewer, DEFAULT_VIEW, 0);
    expect(b.select(mobs, viewer, DEFAULT_VIEW, 0.04)).toHaveLength(1); // b has never been told
    expect(a.select(mobs, viewer, DEFAULT_VIEW, 0.04)).toHaveLength(0);
  });
});

describe('eventInView', () => {
  const viewer = { x: 1000, y: 1000 };
  const reach = DEFAULT_VIEW + VIEW_MARGIN;
  const BOLT = 224;

  it('sends what happens within the view plus the margin, and not beyond', () => {
    expect(
      eventInView({ type: 'text', x: 1000 + reach, y: 1000, text: '5', color: 0 }, viewer, DEFAULT_VIEW, BOLT),
    ).toBe(true);
    expect(
      eventInView({ type: 'text', x: 1001 + reach, y: 1000, text: '5', color: 0 }, viewer, DEFAULT_VIEW, BOLT),
    ).toBe(false);
    expect(eventInView({ type: 'slash', x: 1000, y: 1000 - reach - 1, dir: 0, p: 1 }, viewer, DEFAULT_VIEW, BOLT)).toBe(
      false,
    );
  });

  it('counts a shot that could fly into view', () => {
    const far = 1000 + reach + 100;
    expect(eventInView({ type: 'bolt', x: far, y: 1000, vx: -260, vy: 0 }, viewer, DEFAULT_VIEW, BOLT)).toBe(true);
    expect(eventInView({ type: 'bolt', x: far + BOLT, y: 1000, vx: -260, vy: 0 }, viewer, DEFAULT_VIEW, BOLT)).toBe(
      false,
    );
    const arrow = { type: 'arrow', x: far, y: 1000, vx: -300, vy: 0 } as const;
    expect(eventInView({ ...arrow, range: 150 }, viewer, DEFAULT_VIEW, BOLT)).toBe(true);
    expect(eventInView({ ...arrow, range: 50 }, viewer, DEFAULT_VIEW, BOLT)).toBe(false);
  });

  it('always sends a defeat', () => {
    expect(eventInView({ type: 'defeat', player: 2 }, viewer, DEFAULT_VIEW, BOLT)).toBe(true);
  });
});

describe('fitEvents', () => {
  const events = Array.from({ length: 10 }, (_, i) => {
    const wire = encodeEvent(i + 1, { type: 'text', x: 100, y: 200, text: 'x'.repeat(i), color: 0 });
    return { wire, size: JSON.stringify(wire).length };
  });
  const ids = (wires: EventWire[]) => wires.map((w) => w[0]);
  const total = (n: number) => events.slice(events.length - n).reduce((sum, e) => sum + e.size + 1, 0);

  it('keeps the newest that fit, oldest first', () => {
    const n = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((k) => total(k - 1) > MIN_EVENT_ROOM) ?? 10; // a room above the floor
    const newest = (k: number) => events.slice(events.length - k).map((e) => e.wire[0]);
    expect(ids(fitEvents(events, total(n), 48))).toEqual(newest(n));
    expect(ids(fitEvents(events, total(n) - 1, 48))).toEqual(newest(n - 1));
  });

  it('sends everything when there is room, up to the count limit', () => {
    expect(ids(fitEvents(events, 10_000, 48))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ids(fitEvents(events, 10_000, 4))).toEqual([7, 8, 9, 10]);
    expect(fitEvents([], 10_000, 48)).toEqual([]);
  });

  it('still lets a few through when the rest of the snapshot is already large', () => {
    const fitted = fitEvents(events, -500, 48);
    expect(fitted.length).toBeGreaterThan(0);
    expect(ids(fitted).at(-1)).toBe(10);
    expect(fitted.reduce((sum, w) => sum + JSON.stringify(w).length + 1, 0)).toBeLessThanOrEqual(MIN_EVENT_ROOM);
  });
});
