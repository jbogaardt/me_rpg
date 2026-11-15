import { describe, expect, it } from 'vitest';
import { keyAction, typing } from './hotkeys';

describe('keyAction', () => {
  it('maps digits to the dock, one-based', () => {
    expect(keyAction({ key: '1' })).toEqual({ k: 'dock', n: 1 });
    expect(keyAction({ key: '9' })).toEqual({ k: 'dock', n: 9 });
    expect(keyAction({ key: '0' })).toBeUndefined();
  });
  it('maps the camera keys', () => {
    expect(keyAction({ key: 'h' })).toEqual({ k: 'home' });
    expect(keyAction({ key: ' ' })).toEqual({ k: 'home' });
    expect(keyAction({ key: 'F' })).toEqual({ k: 'fit' });
    expect(keyAction({ key: '+' })).toEqual({ k: 'zoom', by: 1 });
    expect(keyAction({ key: '-' })).toEqual({ k: 'zoom', by: -1 });
  });
  it('leaves the existing keys and chords alone', () => {
    for (const key of ['m', 'a', 'w', 's', 'd', 'c', 'x', 'Escape', 'ArrowUp'])
      expect(keyAction({ key })).toBeUndefined();
    expect(keyAction({ key: 'f', ctrlKey: true })).toBeUndefined();
    expect(keyAction({ key: '1', metaKey: true })).toBeUndefined();
  });
});

describe('typing', () => {
  it('is true only in text boxes', () => {
    expect(typing({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(typing({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(typing(null)).toBe(false);
  });
});
