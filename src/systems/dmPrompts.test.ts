import { describe, expect, it } from 'vitest';
import { PROMPT_GAP, Prompter, type PromptState } from './dmPrompts';

const state = (s: Partial<PromptState> = {}): PromptState => ({
  storyReady: false,
  area: 'greenwood',
  questsDone: 0,
  busy: false,
  ...s,
});

describe('Prompter', () => {
  it('offers the story at once when the party has finished what was told, then waits a moment', () => {
    const p = new Prompter();
    expect(p.tick(1, state())).toBeNull();
    expect(p.tick(5, state({ storyReady: true }))).toBe('story');
    expect(p.tick(1, state({ storyReady: true }))).toBeNull(); // not a second card straight away
    expect(p.tick(5, state({ storyReady: true }))).toBe('story'); // still unanswered: asked again
  });

  it('never offers anything while a card is up', () => {
    const p = new Prompter();
    expect(p.tick(100, state({ storyReady: true, busy: true }))).toBeNull();
    expect(p.tick(1, state({ storyReady: true }))).toBe('story');
  });

  it('offers the sky when the party reaches a new area, once the gap has passed', () => {
    const p = new Prompter();
    p.tick(PROMPT_GAP, state());
    expect(p.tick(0.1, state({ area: 'eastwood' }))).toBe('sky');
    expect(p.tick(PROMPT_GAP, state({ area: 'eastwood' }))).toBeNull(); // only once per arrival
  });

  it('offers the pressure when a quest is finished, after the sky', () => {
    const p = new Prompter();
    p.tick(PROMPT_GAP, state());
    expect(p.tick(0.1, state({ questsDone: 1, area: 'eastwood' }))).toBe('sky');
    expect(p.tick(PROMPT_GAP, state({ questsDone: 1, area: 'eastwood' }))).toBe('pressure');
    expect(p.tick(PROMPT_GAP, state({ questsDone: 1, area: 'eastwood' }))).toBeNull();
  });

  it('does not nag for what the DM already set by hand', () => {
    const p = new Prompter();
    p.tick(PROMPT_GAP, state());
    p.tick(0.1, state({ area: 'desert', busy: true }));
    p.settled('sky');
    expect(p.tick(PROMPT_GAP, state({ area: 'desert' }))).toBeNull();
  });

  it('starts from nothing again after a reset', () => {
    const p = new Prompter();
    p.tick(PROMPT_GAP, state());
    p.tick(1, state({ area: 'desert', busy: true }));
    p.reset();
    expect(p.tick(PROMPT_GAP, state({ area: 'desert' }))).toBeNull();
  });
});
