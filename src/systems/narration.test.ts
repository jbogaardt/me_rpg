import { describe, expect, it } from 'vitest';
import { DEFAULT_WELCOME, Narrator, readTime } from './narration';

describe('Narrator', () => {
  it('says the first line at once and each next one after its reading time', () => {
    const n = new Narrator();
    n.tell(['One.', '  ', 'Two.']);
    expect(n.tick(0)).toBe('One.');
    expect(n.tick(1)).toBeNull();
    expect(n.tick(readTime('One.'))).toBe('Two.');
    expect(n.busy).toBe(true); // still reading the last line
    n.tick(readTime('Two.'));
    expect(n.busy).toBe(false);
  });

  it('queues more while it is talking, and can be cleared', () => {
    const n = new Narrator();
    n.tell(['A.']);
    n.tick(0);
    n.tell(['B.']);
    expect(n.tick(0.1)).toBeNull();
    n.clear();
    expect(n.tick(100)).toBeNull();
    expect(n.busy).toBe(false);
  });

  it('gives longer lines longer, within what the DM’s words stay on screen', () => {
    expect(readTime('Hi.')).toBe(4);
    expect(readTime('x'.repeat(60))).toBeGreaterThan(readTime('x'.repeat(20)));
    expect(readTime('x'.repeat(500))).toBe(8);
    expect(DEFAULT_WELCOME.length).toBeGreaterThan(0);
  });
});
