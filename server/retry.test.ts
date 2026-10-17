import { describe, expect, it } from 'vitest';
import { RetryingReader, type PulseState } from './pulse';

const ps: PulseState = {
  area: 'x',
  party: { players: 1, averageHealthPercent: 100, lowestHealthPercent: 100, fallen: 0 },
  progress: { questActive: false, secondsSinceQuestOffered: 0, secondsSinceDmSpoke: 0 },
};
const ok = { pressure: 0.5, stalled: 0, wantsWord: 0, needsQuest: 0 };

/** A reader whose first `fails` reads fail with "fetch failed". */
const harness = (fails: number) => {
  const waits: number[] = [];
  const lines: string[] = [];
  let calls = 0;
  const inner = { read: () => (++calls <= fails ? Promise.reject(new Error('fetch failed')) : Promise.resolve(ok)) };
  const sleep = (ms: number) => (waits.push(ms), Promise.resolve());
  return { reader: new RetryingReader(inner, 3, 100, sleep, (l) => lines.push(l)), waits, lines, calls: () => calls };
};

describe('RetryingReader', () => {
  it('retries a failed fetch with a doubling wait, then succeeds', async () => {
    const h = harness(2);
    expect(await h.reader.read(ps)).toEqual(ok);
    expect(h.calls()).toBe(3);
    expect(h.waits).toEqual([100, 200]);
    expect(h.lines[0]).toContain('fetch failed');
  });
  it('gives up after the attempts with an error naming the step', async () => {
    const h = harness(9);
    await expect(h.reader.read(ps)).rejects.toThrow(/table read \(Jev\).*3 attempts.*fetch failed/);
    expect(h.calls()).toBe(3);
  });
});
