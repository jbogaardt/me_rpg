import { describe, expect, it } from 'vitest';
import { MockArcWriter, STOCK_ARCS, advance, arcBrief, readArc } from './arc';

describe('the session arc', () => {
  it('takes a well-made arc and refuses one too short, too long or with blank chapters', () => {
    const ok = { title: 'T', threat: 'A threat.', stake: 'A stake.', chapters: ['a', 'b', 'c'] };
    expect(readArc(ok)).toEqual(ok);
    expect(readArc({ ...ok, chapters: ['a', 'b'] })).toBeNull();
    expect(readArc({ ...ok, chapters: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBeNull();
    expect(readArc({ ...ok, chapters: ['a', '', 'c'] })).toBeNull();
    expect(readArc({ ...ok, title: '' })).toBeNull();
    expect(readArc(null)).toBeNull();
  });

  it('every stock arc is one the reader accepts', () => {
    for (const arc of STOCK_ARCS) expect(readArc(arc)).toEqual(arc);
  });

  it('walks the chapters in order and says when the reckoning comes', () => {
    const arc = STOCK_ARCS[0]!;
    let place: ReturnType<typeof advance> = { arc, chapter: 0 };
    expect(arcBrief(place)).toContain('chapter 1 of 4');
    expect(arcBrief(place)).toContain('not yet faced');
    for (let i = 0; i < 3; i++) place = advance(place as { arc: typeof arc; chapter: number });
    expect(place).toMatchObject({ chapter: 3 });
    expect(arcBrief(place as { arc: typeof arc; chapter: number })).toContain('last chapter');
    expect(advance(place as { arc: typeof arc; chapter: number })).toBe('done');
  });

  it('the mock tells the stock arcs in turn', async () => {
    const w = new MockArcWriter();
    expect((await w.write())?.title).toBe(STOCK_ARCS[0]!.title);
    expect((await w.write())?.title).toBe(STOCK_ARCS[1]!.title);
  });
});
