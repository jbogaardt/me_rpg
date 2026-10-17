import { describe, expect, it } from 'vitest';
import { MAX_SAY, cleanSay } from './dmPowers';
import {
  ANIM_ACTIONS,
  CueStream,
  CueTimeline,
  MAX_CUES,
  MAX_SAY_CUED,
  cleanCued,
  mapCued,
  parseCued,
  parseTag,
  serializeCued,
  stripCues,
  tagOf,
  type Cue,
} from './cues';

const LUNGE = '<cue:anim actor="p1" action="lunge" dir="right" />';

describe('parseTag', () => {
  it('reads the three kinds', () => {
    expect(parseTag(LUNGE)).toEqual({ kind: 'anim', actor: 'p1', action: 'lunge', dir: 'right' });
    expect(parseTag('<cue:sfx name="glass_break" />')).toEqual({ kind: 'sfx', name: 'glass_break' });
    expect(parseTag('<cue:camera shake="0.5" duration="0.3" />')).toEqual({
      kind: 'camera',
      shake: 0.5,
      duration: 0.3,
    });
  });

  it('takes shake by name, clamps numbers and defaults the duration', () => {
    expect(parseTag('<cue:camera shake="heavy" />')).toEqual({ kind: 'camera', shake: 1, duration: 0.4 });
    expect(parseTag('<cue:camera shake="7" duration="99" />')).toEqual({ kind: 'camera', shake: 1, duration: 2 });
    expect(parseTag("<cue:camera shake='light' duration='0' />")).toEqual({
      kind: 'camera',
      shake: 0.3,
      duration: 0.1,
    });
  });

  it('refuses anything outside the vocabulary', () => {
    expect(parseTag('<cue:anim actor="dragon" action="slash" />')).toBeNull();
    expect(parseTag('<cue:anim actor="p1" action="moonwalk" />')).toBeNull();
    expect(parseTag('<cue:sfx name="../../etc/passwd" />')).toBeNull();
    expect(parseTag('<cue:camera shake="nope" />')).toBeNull();
    expect(parseTag('<cue:camera duration="1" />')).toBeNull();
    expect(parseTag('<cue:teleport actor="p1" />')).toBeNull();
  });

  it('ignores a bad direction but keeps the cue', () => {
    expect(parseTag('<cue:anim actor="foe" action="hurt" dir="sideways" />')).toEqual({
      kind: 'anim',
      actor: 'foe',
      action: 'hurt',
    });
  });
});

describe('parseCued', () => {
  it('cuts tags out of the words and places each at the offset it was written', () => {
    const said = parseCued(`He lunges ${LUNGE}and the blade rings <cue:sfx name="steel_clash" />off iron.`);
    expect(said.text).toBe('He lunges and the blade rings off iron.');
    expect(said.cues.map((c) => [c.kind, said.text.slice(c.at)])).toEqual([
      ['anim', 'and the blade rings off iron.'],
      ['sfx', 'off iron.'],
    ]);
  });

  it('leaves no double spaces where a tag sat between spaces, or a trailing space', () => {
    const said = parseCued('Hold. <cue:sfx name="thud" /> Now. <cue:sfx name="thud" />');
    expect(said.text).toBe('Hold. Now.');
    expect(said.cues.map((c) => c.at)).toEqual([6, 10]);
  });

  it('shows nothing of a malformed, unknown or unclosed tag', () => {
    expect(stripCues('a <cue:sfx name="nope" /> b')).toBe('a b');
    expect(stripCues('a <cue:anim actor="p1" action="slash" no end')).toBe('a');
    expect(stripCues('a <cu')).toBe('a');
  });

  it('keeps a plain angle bracket', () => {
    expect(stripCues('if 3 < 5 then <b>bold</b>')).toBe('if 3 < 5 then <b>bold</b>');
  });

  it('keeps at most MAX_CUES cues', () => {
    const many = Array.from({ length: MAX_CUES + 3 }, () => '<cue:sfx name="thud" />x').join('');
    expect(parseCued(many).cues).toHaveLength(MAX_CUES);
  });
});

describe('CueStream', () => {
  const whole = `One ${LUNGE}two <cue:camera shake="0.5" duration="0.3" />three`;

  it('gives the same words and cues however the text is cut into pieces', () => {
    const expected = parseCued(whole);
    for (const size of [1, 2, 3, 5, 7, 11, 1000]) {
      const stream = new CueStream();
      let text = '';
      const cues: Cue[] = [];
      for (let i = 0; i < whole.length; i += size) {
        const step = stream.push(whole.slice(i, i + size));
        text += step.text;
        cues.push(...step.cues);
      }
      expect({ text: text.replace(/ $/, ''), cues }).toEqual(expected);
    }
  });

  it('never lets a half-arrived tag show', () => {
    const stream = new CueStream();
    expect(stream.push('Steel <cue:sfx na').text).toBe('Steel ');
    const done = stream.push('me="steel_clash" />rings');
    expect(done.text).toBe('rings');
    expect(done.cues).toEqual([{ kind: 'sfx', name: 'steel_clash', at: 6 }]);
  });

  it('drops a tag that never closes rather than swallow what follows', () => {
    const stream = new CueStream();
    stream.push(`before <cue:anim actor="p1" ${'x'.repeat(200)}`);
    expect(stream.push(' and after').text).toBe('and after'); // the space before the lost tag was already read
  });
});

describe('serialize and clean', () => {
  it('writes tags back where they were, and reads them again unchanged', () => {
    const said = parseCued(`Mid${LUNGE}dle <cue:sfx name="thud" />end`);
    expect(parseCued(serializeCued(said))).toEqual(said);
    expect(tagOf(said.cues[0]!)).toBe(LUNGE);
  });

  it('cleanCued is cleanSay for plain words', () => {
    expect(cleanCued('  hello\n  there  ')).toBe(cleanSay('  hello\n  there  '));
    expect(cleanCued('x'.repeat(MAX_SAY + 50))).toHaveLength(MAX_SAY);
    expect(cleanCued('  \n ')).toBe('');
  });

  it('cleanCued normalises the tags, drops the invalid and keeps a tagged line within the wire limit', () => {
    expect(cleanCued("Hit. <cue:sfx name='thud'/> <cue:sfx name='bad'/>")).toBe('Hit.<cue:sfx name="thud" />');
    const long = Array.from(
      { length: 8 },
      () => `<cue:anim actor="party" action="stagger" dir="right" />${'w'.repeat(60)}`,
    );
    const out = cleanCued(long.join(''));
    expect(out.length).toBeLessThanOrEqual(MAX_SAY_CUED);
    expect(stripCues(out).length).toBeLessThanOrEqual(MAX_SAY);
  });

  it('every action and actor the grammar allows survives a round trip', () => {
    for (const action of ANIM_ACTIONS) {
      const tag = `<cue:anim actor="foe" action="${action}" />`;
      expect(cleanCued(`x${tag}y`)).toBe(`x${tag}y`);
    }
  });
});

describe('mapCued', () => {
  it('keeps cues on their words when the text is rewritten', () => {
    const said = parseCued('He *kneels* and "lunges" <cue:sfx name="whoosh" />hard. Then more.');
    const out = mapCued(said, (t) =>
      t
        .replace(/\*[^*]*\*/g, ' ')
        .replace(/["]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    expect(out.text).toBe('He and lunges hard. Then more.');
    expect(out.text.slice(out.cues[0]!.at)).toBe('hard. Then more.');
  });
});

describe('CueTimeline', () => {
  const said = parseCued(`Ab ${LUNGE}cd <cue:sfx name="thud" />ef`);

  it('releases each cue once the reading reaches its offset, never early, never twice', () => {
    const timeline = new CueTimeline(said.text, said.cues, 10); // 10 characters a second
    expect(timeline.duration).toBeCloseTo(0.8);
    const steps = [0.2, 0.2, 0.2, 0.2, 0.2].map((dt) => timeline.advance(dt));
    expect(steps.map((s) => s.shown)).toEqual([2, 4, 6, 8, 8]);
    expect(steps.map((s) => s.due.map((c) => c.kind))).toEqual([[], ['anim'], ['sfx'], [], []]);
    expect(timeline.done).toBe(true);
  });

  it('fires a cue at offset 0 on the first step and one at the end with the last word', () => {
    const t = new CueTimeline(
      'Go',
      [
        { kind: 'sfx', name: 'thud', at: 0 },
        { kind: 'sfx', name: 'thud', at: 2 },
      ],
      10,
    );
    expect(t.advance(0).due).toHaveLength(1);
    expect(t.advance(0.1).due).toHaveLength(0);
    expect(t.advance(0.1).due).toHaveLength(1);
  });

  it('does not pace words without cues', () => {
    const t = new CueTimeline('plain words', [], 10);
    expect(t.duration).toBe(0);
    expect(t.advance(0).shown).toBe('plain words'.length);
  });
});
