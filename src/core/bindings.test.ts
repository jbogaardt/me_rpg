import { describe, expect, it } from 'vitest';
import { ACTIONS, Bindings, DEFAULT_BINDINGS, codeLabel, loadBindings, saveBindings } from './bindings';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('Bindings', () => {
  it('defaults to left click attack and the usual movement keys', () => {
    const b = new Bindings();
    expect(b.codes('attack')).toContain('Mouse0');
    expect(b.codes('up')).toEqual(['KeyW', 'ArrowUp']);
    expect(b.isDefault()).toBe(true);
  });

  it('takes a key away from the action that had it', () => {
    const b = new Bindings();
    expect(b.set('inventory', 1, 'Space')).toBeNull();
    expect(b.codes('inventory')).toEqual(['KeyI', 'Space']);
    expect(b.codes('attack')).toEqual(['Mouse0']);
    expect(b.actionFor('Space')).toBe('inventory');
  });

  it('refuses the reserved menu keys', () => {
    const b = new Bindings();
    expect(b.set('attack', 0, 'Escape')).toMatch(/reserved/);
    expect(b.set('attack', 0, 'KeyM')).toMatch(/reserved/);
    expect(b.isDefault()).toBe(true);
  });

  it('clears and resets slots', () => {
    const b = new Bindings();
    b.clear('attack', 1);
    expect(b.codes('attack')).toEqual(['Mouse0']);
    b.reset();
    expect(b.isDefault()).toBe(true);
  });

  it('round-trips through storage and drops it again when back to the defaults', () => {
    const store = memory();
    const b = new Bindings();
    b.set('attack', 0, 'KeyF');
    saveBindings(b, store);
    expect(loadBindings(store).codes('attack')).toEqual(['KeyF', 'Space']);
    saveBindings(new Bindings(), store);
    expect(store.data.size).toBe(0);
  });

  it('falls back to defaults for junk, reserved keys and duplicates in storage', () => {
    expect(loadBindings({ getItem: () => 'not json' }).isDefault()).toBe(true);
    expect(new Bindings({ attack: 'x', inventory: [1, 2], magic: ['Mouse2', 'KeyK'] }).isDefault()).toBe(true);
    expect(new Bindings({ attack: ['Escape', 'Space'] }).codes('attack')).toEqual(DEFAULT_BINDINGS.attack);
    const dup = new Bindings({ up: ['KeyW', ''], down: ['KeyW', ''] });
    expect(dup.codes('up')).toEqual(['KeyW']);
    expect(dup.codes('down')).toEqual([]);
  });

  it('never leaves two actions on one code by default', () => {
    const all = ACTIONS.flatMap((a) => DEFAULT_BINDINGS[a]).filter((c) => c !== '');
    expect(new Set(all).size).toBe(all.length);
  });

  it('labels codes for people', () => {
    expect(codeLabel('KeyW')).toBe('W');
    expect(codeLabel('Digit3')).toBe('3');
    expect(codeLabel('Mouse0')).toBe('Left click');
    expect(codeLabel('Mouse2')).toBe('Right click');
    expect(codeLabel('ArrowUp')).toBe('↑');
    expect(codeLabel('')).toBe('—');
  });
});
