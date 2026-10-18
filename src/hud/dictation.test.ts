import { describe, expect, it } from 'vitest';
import { enterAction, joinHeard, transcript } from './dictation';

describe('enterAction', () => {
  it('starts the mic on an empty line', () => {
    expect(enterAction(false, '', true)).toBe('listen');
    expect(enterAction(false, '   ', true)).toBe('listen');
  });
  it('sends typed text', () => {
    expect(enterAction(false, 'Beware the fen.', true)).toBe('send');
  });
  it('sends as always where there is no speech recognition', () => {
    expect(enterAction(false, '', false)).toBe('send');
  });
  it('stops and sends while listening', () => {
    expect(enterAction(true, '', true)).toBe('stop');
    expect(enterAction(true, 'half a sentence', true)).toBe('stop');
  });
});

describe('joinHeard', () => {
  it('starts fresh after a clear and appends after kept words', () => {
    expect(joinHeard('', 'the fen')).toBe('the fen');
    expect(joinHeard('Beware ', 'the fen')).toBe('Beware the fen');
    expect(joinHeard('Beware', '')).toBe('Beware');
  });
});

describe('transcript', () => {
  it('joins the best guess of each heard chunk', () => {
    const chunk = (t: string) => Object.assign([{ transcript: t }], { isFinal: true });
    expect(transcript([chunk('Beware '), chunk('the fen. ')])).toBe('Beware the fen.');
    expect(transcript([])).toBe('');
  });
});
