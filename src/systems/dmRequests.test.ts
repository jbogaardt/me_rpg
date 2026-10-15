import { describe, expect, it } from 'vitest';
import {
  cleanAsk,
  describe as say,
  Inbox,
  INBOX_MAX,
  MAX_ASK,
  MESSAGE_CODE,
  REPLIES,
  REQUESTS,
  REQUEST_LIFE,
  SUGGESTION_LIFE,
} from './dmRequests';

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

  it('keeps who asked, so the DM can answer them', () => {
    const box = new Inbox();
    box.add('lost', 0, 'Player 2', 1);
    box.add('lost', 1, 'Player 3', 2);
    expect(box.list[0]!.slots).toEqual([1, 2]);
  });

  it('holds every message on its own, and a message is never dropped by an action on a kind', () => {
    const box = new Inbox();
    box.add('message', 0, 'Player 2', 1, 'help at the bridge');
    box.add('message', 1, 'Player 2', 1, 'help at the bridge');
    box.add('message', 2, 'Player 3', 2, 'help at the bridge');
    box.add('message', 3, 'Player 2', 1, 'where is the key');
    expect(box.size).toBe(3);
    box.drop('message');
    expect(box.size).toBe(3);
    expect(say(box.list[0]!)).toBe('Player 2: “help at the bridge”');
  });

  it('cleans what a player types, and has requests, replies and a code for words of their own', () => {
    expect(cleanAsk('  help\n  me ')).toBe('help me');
    expect(cleanAsk('x'.repeat(MAX_ASK + 30))).toHaveLength(MAX_ASK);
    expect(MESSAGE_CODE).toBe(REQUESTS.length);
    expect(REPLIES.length).toBeGreaterThanOrEqual(3);
    expect(REQUESTS.map((r) => r.kind)).toContain('epic');
  });

  it('never holds more than its limit, and every request maps to a card', () => {
    const box = new Inbox();
    const kinds = ['revive', 'story', 'struggle', 'easy', 'twist', 'lost', 'done', 'next', 'land'] as const;
    for (const k of kinds) box.add(k, 0);
    expect(box.size).toBe(INBOX_MAX);
    expect(new Set(REQUESTS.map((r) => r.kind)).size).toBe(REQUESTS.length);
  });
});
