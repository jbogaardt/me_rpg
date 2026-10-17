import { describe, expect, it } from 'vitest';
import { BREATHER_SECONDS, Breather, clockText } from './breather';

describe('breather', () => {
  it('runs for its seconds and says so on the frame it ends', () => {
    const b = new Breather();
    expect(b.active).toBe(false);
    b.start();
    expect(b.seconds).toBe(BREATHER_SECONDS);
    expect(b.tick(BREATHER_SECONDS - 1)).toBe(false);
    expect(b.active).toBe(true);
    expect(b.tick(5)).toBe(true);
    expect(b.active).toBe(false);
    expect(b.tick(1)).toBe(false); // already over: nothing to report twice
  });

  it('ends early when the next quest begins', () => {
    const b = new Breather();
    b.start(30);
    b.end();
    expect(b.active).toBe(false);
  });

  it('reads as a clock', () => {
    expect(clockText(42)).toBe('0:42');
    expect(clockText(41.2)).toBe('0:42');
    expect(clockText(65)).toBe('1:05');
    expect(clockText(0)).toBe('0:00');
  });
});
