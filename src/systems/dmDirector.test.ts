import { describe, expect, it } from 'vitest';
import { CARD_GAP, Director, IDLE_BEFORE_NEXT, type DirectorState } from './dmDirector';

const state = (s: Partial<DirectorState> = {}): DirectorState => ({
  busy: false,
  fallen: false,
  storyReady: false,
  task: null,
  health: { avg: 0.6, min: 0.6 },
  area: 'greenwood',
  ...s,
});
const task = (progress: number, goal = 10, id = 1, extra: Partial<NonNullable<DirectorState['task']>> = {}) => ({
  id,
  active: true,
  progress,
  goal,
  age: 20,
  sinceProgress: 5,
  hint: 0,
  finished: null,
  ...extra,
});

/** Run the director with a quiet world for `seconds`, returning the first card it offered. */
function waitFor(d: Director, seconds: number, s: DirectorState): ReturnType<Director['tick']> {
  for (let t = 0; t < seconds; t += 1) {
    const got = d.tick(1, s);
    if (got) return got;
  }
  return null;
}

describe('the director', () => {
  it('pops "what now?" when nothing has been asked of the party for a while, and nags softly after', () => {
    const d = new Director();
    expect(waitFor(d, IDLE_BEFORE_NEXT - 2, state())).toBeNull();
    expect(waitFor(d, 5, state())).toBe('next');
    expect(waitFor(d, IDLE_BEFORE_NEXT - 2, state())).toBeNull(); // not again straight away
    expect(waitFor(d, 5, state())).toBe('next');
  });

  it('stays quiet while a card, a dialog or the menu has the screen', () => {
    const d = new Director();
    expect(waitFor(d, 100, state({ busy: true, fallen: true, storyReady: true }))).toBeNull();
    expect(waitFor(d, 5, state({ fallen: true }))).toBe('revive');
  });

  it('offers the story as soon as it is ready, and a fallen player before it', () => {
    const d = new Director();
    expect(waitFor(d, 5, state({ storyReady: true }))).toBe('story');
    expect(waitFor(d, 5, state({ storyReady: true, fallen: true }))).toBe('revive');
  });

  it('part way through a task, a party breezing through is offered more heat', () => {
    const d = new Director();
    waitFor(d, CARD_GAP, state({ task: task(0) })); // settle
    expect(d.tick(1, state({ task: task(3), health: { avg: 0.95, min: 0.9 } }))).toBeNull(); // not yet half
    expect(d.tick(1, state({ task: task(4), health: { avg: 0.95, min: 0.9 } }))).toBe('easy');
    expect(waitFor(d, 60, state({ task: task(5), health: { avg: 0.95, min: 0.9 } }))).toBeNull(); // once per task
  });

  it('a party that is hurting is offered a way to ease off, at any time', () => {
    const d = new Director();
    waitFor(d, CARD_GAP, state({ task: task(0) }));
    expect(d.tick(1, state({ task: task(1), health: { avg: 0.4, min: 0.2 } }))).toBe('struggle');
    expect(waitFor(d, 30, state({ task: task(1), health: { avg: 0.4, min: 0.2 } }))).toBeNull(); // not a nag
    expect(waitFor(d, 40, state({ task: task(1), health: { avg: 0.4, min: 0.2 } }))).toBe('struggle'); // later, again
  });

  it('a task half done with a party that is neither gets a twist; a hurt one is offered relief instead', () => {
    const middling = new Director();
    waitFor(middling, CARD_GAP, state({ task: task(0) }));
    expect(middling.tick(1, state({ task: task(5), health: { avg: 0.65, min: 0.5 } }))).toBe('twist');
    const worn = new Director();
    waitFor(worn, CARD_GAP, state({ task: task(0) }));
    expect(worn.tick(1, state({ task: task(5), health: { avg: 0.45, min: 0.4 } }))).toBe('struggle');
  });

  it('judges a one-step quest (find, reach) by how long it has taken, and starts afresh for each new quest', () => {
    const d = new Director();
    waitFor(d, CARD_GAP, state({ task: task(0, 1, 1, { age: 30 }) }));
    expect(d.tick(1, state({ task: task(0, 1, 1, { age: 40 }), health: { avg: 1, min: 1 } }))).toBeNull();
    expect(d.tick(1, state({ task: task(0, 1, 1, { age: 80 }), health: { avg: 1, min: 1 } }))).toBe('easy');
    const e = new Director();
    waitFor(e, CARD_GAP, state({ task: task(0, 10, 1) }));
    expect(e.tick(1, state({ task: task(5, 10, 1), health: { avg: 1, min: 1 } }))).toBe('easy');
    waitFor(e, CARD_GAP, state({ task: task(0, 10, 2) }));
    expect(e.tick(1, state({ task: task(5, 10, 2), health: { avg: 1, min: 1 } }))).toBe('easy');
  });

  it('notices a party that is lost, once, and again only much later; not once the DM has pointed the way', () => {
    const d = new Director();
    waitFor(d, CARD_GAP, state({ task: task(0, 5, 1, { sinceProgress: 10 }) }));
    expect(d.tick(1, state({ task: task(0, 5, 1, { sinceProgress: 95 }) }))).toBe('lost');
    expect(waitFor(d, 60, state({ task: task(0, 5, 1, { sinceProgress: 150 }) }))).toBeNull();
    expect(waitFor(d, 70, state({ task: task(0, 5, 1, { sinceProgress: 220 }) }))).toBe('lost');
    const e = new Director();
    waitFor(e, CARD_GAP, state({ task: task(0, 5, 1, { sinceProgress: 10 }) }));
    expect(e.tick(1, state({ task: task(0, 5, 1, { sinceProgress: 200, hint: 2 }) }))).toBeNull();
  });

  it('nudges the DM when a quest ends quick and easy or hard-won, once, but not when it was neither', () => {
    const smooth = new Director();
    waitFor(smooth, CARD_GAP, state({ task: task(0) }));
    smooth.tick(1, state({ task: task(10) }));
    expect(smooth.tick(4, state({ task: task(10, 10, 1, { active: false, finished: 'smooth' }) }))).toBe('done');
    expect(smooth.tick(4, state({ task: task(10, 10, 1, { active: false, finished: 'smooth' }) }))).toBeNull();
    const plain = new Director();
    waitFor(plain, CARD_GAP, state({ task: task(0) }));
    plain.tick(1, state({ task: task(10) }));
    expect(plain.tick(4, state({ task: task(10, 10, 1, { active: false, finished: 'plain' }) }))).toBeNull();
  });

  it('asks about the sky when the party reaches a new land, and nudges after a breather once a quest ends', () => {
    const d = new Director();
    waitFor(d, CARD_GAP, state());
    expect(d.tick(1, state({ area: 'eastwood' }))).toBe('land');
    const e = new Director();
    waitFor(e, CARD_GAP, state({ task: task(0) }));
    e.tick(1, state({ task: task(10) }));
    e.tick(1, state({ task: { ...task(10), active: false, finished: 'plain' } })); // done
    expect(waitFor(e, 30, state())).toBeNull(); // time to wander first
    expect(waitFor(e, 20, state())).toBe('next');
  });

  it('can be settled, snoozed and reset', () => {
    const d = new Director();
    d.snooze(30);
    expect(waitFor(d, 20, state({ storyReady: true }))).toBeNull(); // "not now": a breather, even for the story
    expect(waitFor(d, 10, state({ storyReady: true }))).toBe('story'); // then it asks again
    const e = new Director();
    waitFor(e, 3, state());
    e.reset();
    expect(waitFor(e, 5, state({ fallen: true }))).toBe('revive');
  });
});
