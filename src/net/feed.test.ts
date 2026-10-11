import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, IDLE_RESEND, MobFeed, VIEW_MARGIN } from './feed';
import type { MobFields } from './protocol';

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
