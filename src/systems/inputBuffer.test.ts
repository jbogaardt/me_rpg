import { describe, expect, it } from 'vitest';
import { ATTACK_BUFFER_S, AttackBuffer } from './inputBuffer';

const DT = 1 / 60;
const COOLDOWN = 0.35;

/** A minimal swing loop: the cooldown counts down, the buffer may fire, a swing resets the cooldown. */
function run(seconds: number, opts: { press?: (t: number) => boolean; hold?: boolean }) {
  const buf = new AttackBuffer();
  let cooldown = 0;
  const swings: number[] = [];
  const swing = (t: number) => {
    cooldown = COOLDOWN;
    swings.push(+t.toFixed(3));
  };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = i * DT;
    cooldown = Math.max(0, cooldown - DT);
    if (buf.step(DT, cooldown, 'z')) swing(t);
    if (opts.press?.(t)) {
      if (cooldown > 0) buf.press('z');
      else swing(t);
    } else if (opts.hold) buf.press('z');
  }
  return swings;
}

describe('attack buffer', () => {
  it('fires on the first legal tick for a press just before the cooldown ends', () => {
    const buf = new AttackBuffer();
    buf.press('z');
    expect(buf.step(DT, 0.1 - DT, 'z')).toBe(false);
    expect(buf.step(DT, 0, 'z')).toBe(true);
    expect(buf.pending).toBe(false);
  });

  it('does not queue a press made long before the cooldown ends', () => {
    expect(0.3).toBeGreaterThan(ATTACK_BUFFER_S);
    const buf = new AttackBuffer();
    buf.press('z');
    let cooldown = 0.3;
    let fired = false;
    for (let i = 0; i < 30; i++) {
      cooldown = Math.max(0, cooldown - DT);
      fired ||= buf.step(DT, cooldown, 'z');
    }
    expect(fired).toBe(false);
  });

  it('two taps 0.2 s apart give two swings', () => {
    const swings = run(1, { press: (t) => Math.abs(t - 0.1) < DT / 2 || Math.abs(t - 0.3) < DT / 2 });
    expect(swings).toHaveLength(2);
    expect(swings[1]! - swings[0]!).toBeLessThanOrEqual(COOLDOWN + 2 * DT);
  });

  it('clears on fire, clear and zone change', () => {
    const buf = new AttackBuffer();
    buf.press('z');
    expect(buf.step(DT, 0, 'z')).toBe(true);
    expect(buf.step(DT, 0, 'z')).toBe(false);
    buf.press('z');
    buf.clear();
    expect(buf.step(DT, 0, 'z')).toBe(false);
    buf.press('a');
    expect(buf.step(DT, 0, 'b')).toBe(false);
    expect(buf.step(DT, 0, 'a')).toBe(false);
  });

  it('keeps one pending press: a newer press refreshes it, it fires once', () => {
    const buf = new AttackBuffer();
    buf.press('z');
    buf.step(0.1, 0.5, 'z');
    buf.press('z'); // refreshed to the full window
    expect(buf.step(0.1, 0.5, 'z')).toBe(false);
    expect(buf.pending).toBe(true);
    expect(buf.step(DT, 0, 'z')).toBe(true);
    expect(buf.step(DT, 0, 'z')).toBe(false);
  });

  it('expires', () => {
    const buf = new AttackBuffer();
    buf.press('z');
    buf.step(ATTACK_BUFFER_S + DT, 0.3, 'z');
    expect(buf.pending).toBe(false);
  });

  it('holding chains swings at the max rate', () => {
    const swings = run(1.5, { press: (t) => t === 0, hold: true });
    expect(swings.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < swings.length; i++) expect(swings[i]! - swings[i - 1]!).toBeLessThanOrEqual(COOLDOWN + 2 * DT);
  });
});
