import { describe, expect, it } from 'vitest';
import { draftIssues, issueKey, keyMarker, postIssues, safeQuote } from './issues';
import type { Finding, Triage } from './triage';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  kind: 'bug',
  area: 'cave',
  foe: null,
  severity: 2,
  count: 3,
  players: ['P1', 'P2'],
  score: 5,
  quotes: ['stuck in the wall http://evil.example @everyone `x`'],
  evidence: [0],
  why: ['2 knockouts here'],
  ...over,
});
const tri = (...f: Finding[]): Triage => ({
  findings: f,
  wishlist: [],
  praise: [],
  skipped: { inCharacter: 0, social: 0, control: 0, noise: 0, abuse: 0, helped: 0 },
});

describe('issues', () => {
  it('strips links, mentions and markup from quotes', () => {
    const q = safeQuote('see http://x.y @bob mail a@b.c `code` <b>hi</b> 1234567890');
    expect(q).not.toMatch(/http|@|`|<|\d{6}/);
    expect(safeQuote('a'.repeat(500)).length).toBeLessThanOrEqual(140);
  });

  it('keys by kind, area and foe; drafts carry the key', () => {
    expect(issueKey(finding())).toBe(issueKey(finding({ players: ['P9'] })));
    expect(issueKey(finding())).not.toBe(issueKey(finding({ area: 'sewer' })));
    const [d] = draftIssues(tri(finding()));
    expect(d?.body).toContain(keyMarker(d!.key));
    expect(d?.body).not.toMatch(/evil\.example|@everyone/);
    expect(d?.labels).toEqual(['playtest', 'bug']);
  });

  it('files only what is worth it, at most three', () => {
    const many = [1, 2, 3, 4, 5].map((n) => finding({ area: `a${n}` }));
    expect(draftIssues(tri(...many))).toHaveLength(3);
    expect(draftIssues(tri(finding({ severity: 1, count: 1 })))).toHaveLength(0);
  });

  it('skips a duplicate, creates a new one, and files nothing when it cannot tell', async () => {
    const drafts = draftIssues(tri(finding({ area: 'a' }), finding({ area: 'b' }), finding({ area: 'c' })));
    const calls: string[] = [];
    let searches = 0;
    const res = await postIssues(drafts, 'o/r', 't', (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`);
      if (url.includes('search')) {
        searches++;
        const hit = [1, 0, -1][searches - 1] ?? -1;
        return Promise.resolve({ ok: hit >= 0, status: 200, json: () => Promise.resolve({ total_count: hit }) });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ html_url: 'https://github.com/o/r/issues/1' }),
      });
    });
    expect(res.map((r) => r.state)).toEqual(['duplicate', 'created', 'failed']);
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
  });
});
