import { describe, expect, it } from 'vitest';
import { MAX_SAY } from './dmPowers';
import * as voice from './dmVoice';
import { REPLIES } from './dmRequests';

const banks: [string, string[]][] = [
  ['done', voice.DONE_WORDS],
  ['breather', voice.BREATHER_WORDS],
  ['failed', voice.FAILED_WORDS],
  ['cancel', voice.CANCEL_WORDS],
  ['compass', voice.COMPASS_WORDS],
  ['steady', voice.COMPASS_STEADY_WORDS],
  ['replies', voice.REPLY_WORDS],
  ['lost', voice.SAGA_LOST_WORDS],
  ['off', voice.SAGA_OFF_WORDS],
  ['quiet', voice.SAGA_QUIET_WORDS],
  ['nowhere', voice.SIGN_NOWHERE_WORDS],
  ['welcome', voice.WELCOMES.flat()],
  ['meet', voice.MEET_WORDS.map((w) => w('Ansel'))],
  ['talk nudge', voice.TALK_NUDGE_WORDS.map((w) => w('Ansel'))],
];

describe('the DM’s voice', () => {
  it.each(banks)('has several wordings of %s, each fit to be said', (_, lines) => {
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(MAX_SAY);
  });

  it('never falls back to a bare announcement', () => {
    for (const l of [...voice.DONE_WORDS, ...voice.FAILED_WORDS]) expect(l.split(' ').length).toBeGreaterThan(6);
  });

  it('answers a friend in the replies the card offers', () => {
    expect(REPLIES).toBe(voice.REPLY_WORDS);
  });
});
