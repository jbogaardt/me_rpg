import { describe, expect, it } from 'vitest';
import { describe as say, Inbox, INBOX_MAX, REQUESTS, REQUEST_LIFE, SUGGESTION_LIFE } from './dmRequests';

describe('the DM’s inbox', () => {
  it('holds one of a kind, adding a second asker to it, oldest first', () => {
    const box = new Inbox();
    box.add('easy', 0);
    box.add('lost', 1, 'Player 2');
    box.add('lost', 2, 'Player 3');
    box.add('lost', 3, 'Player 2');
    expect(box.size).toBe(2);
    expect(box.list[1]!.from).toEqual(['Player 2', 'Player 3']);
    expect(box.take()!.kind).toBe('easy');
    expect(say(box.take()!)).toBe('Player 2 & Player 3: We are lost');
    expect(box.take()).toBeUndefined();
  });

  it('says what the director saw when nobody asked', () => {
    const box = new Inbox();
    box.add('easy', 0);
    expect(say(box.take()!)).toBe('It is going too easy');
  });

  it('lets a request outlive a nudge, and drops what the DM did by hand', () => {
    const box = new Inbox();
    box.add('easy', 0);
    box.add('lost', 0, 'Player 2');
    box.expire(SUGGESTION_LIFE + 1);
    expect(box.list.map((i) => i.kind)).toEqual(['lost']);
    box.expire(REQUEST_LIFE + 1);
    expect(box.size).toBe(0);
    box.add('next', 0);
    box.drop('next');
    expect(box.size).toBe(0);
  });

  it('never holds more than its limit, and every request maps to a card', () => {
    const box = new Inbox();
    const kinds = ['revive', 'story', 'struggle', 'easy', 'twist', 'lost', 'done', 'next', 'land'] as const;
    for (const k of kinds) box.add(k, 0);
    expect(box.size).toBe(INBOX_MAX);
    expect(new Set(REQUESTS.map((r) => r.kind)).size).toBe(REQUESTS.length);
  });
});
