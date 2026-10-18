import { describe, expect, it } from 'vitest';
import { ANIMS } from '../sprites/doll';
import { SWORD_SWING, contactHits, startSwing, stepSwing, swingAnimMs } from './swing';

const TICK = 1 / 60;
// The overworld's ATTACK_COOLDOWN and MELEE_REACH (scenes/overworld/constants.ts; systems may not import the scenes).
const ATTACK_COOLDOWN = 0.35;
const MELEE_REACH = 22;

/** Ticks of 60 Hz until contact. */
function ticksToContact(): number {
  const s = startSwing(SWORD_SWING, 'town');
  let n = 0;
  while (!stepSwing(s, TICK)) n++;
  return n + 1;
}

describe('the sword swing timeline', () => {
  it('makes contact within 100 ms of the press, well inside the cooldown', () => {
    expect(ticksToContact()).toBeLessThanOrEqual(6);
    expect(SWORD_SWING.startup).toBeLessThan(ATTACK_COOLDOWN);
  });

  it('plays the strike frame of the sheet on the contact tick', () => {
    const ms = swingAnimMs(SWORD_SWING, ANIMS.slash.cycle.length);
    const strikeAt = (SWORD_SWING.strikeStep / ANIMS.slash.cycle.length) * ms;
    expect(strikeAt).toBeCloseTo(SWORD_SWING.startup * 1000);
    // the animation is faster than its sheet default and still shorter than the cooldown
    expect(ms).toBeLessThan(ANIMS.slash.cycle.length * ANIMS.slash.ms);
    expect(ms / 1000).toBeLessThanOrEqual(ATTACK_COOLDOWN);
    // by the contact tick (6 at 60 Hz) the body shows the strike step, not the one before it
    const shown = Math.floor(((ticksToContact() * TICK * 1000) / ms) * ANIMS.slash.cycle.length);
    expect(shown).toBe(SWORD_SWING.strikeStep);
    // and one tick earlier it was still in the windup
    const before = Math.floor((((ticksToContact() - 1) * TICK * 1000) / ms) * ANIMS.slash.cycle.length);
    expect(before).toBeLessThan(SWORD_SWING.strikeStep);
  });
});

describe('the hit check at contact', () => {
  const foe = (x: number, y: number) => ({ x, y, allowance: 0 });

  it('hits a foe in front and misses one behind or out of reach', () => {
    expect(contactHits(0, 0, 'down', [foe(0, 30)], MELEE_REACH)).toHaveLength(1);
    expect(contactHits(0, 0, 'down', [foe(0, -30)], MELEE_REACH)).toHaveLength(0);
    expect(contactHits(0, 0, 'down', [foe(0, 90)], MELEE_REACH)).toHaveLength(0);
  });

  it('uses where the foe stands at contact: one that walked out whiffs, one that stepped in is hit', () => {
    const mob = foe(0, 30); // in reach at the press
    const swing = startSwing(SWORD_SWING, 'town');
    let contact = false;
    for (let i = 0; i < 3; i++) contact = stepSwing(swing, TICK);
    expect(contact).toBe(false);
    mob.y = 90; // walks away during startup
    while (!stepSwing(swing, TICK)) {
      /* wait */
    }
    expect(contactHits(0, 0, 'down', [mob], MELEE_REACH, swing.hit)).toHaveLength(0);

    const late = foe(0, 90); // out of reach at the press
    const second = startSwing(SWORD_SWING, 'town');
    stepSwing(second, TICK);
    late.y = 30; // steps in
    while (!stepSwing(second, TICK)) {
      /* wait */
    }
    expect(contactHits(0, 0, 'down', [late], MELEE_REACH, second.hit)).toHaveLength(1);
  });

  it('uses the facing at contact', () => {
    const mob = foe(30, 0);
    expect(contactHits(0, 0, 'down', [mob], MELEE_REACH)).toHaveLength(0);
    expect(contactHits(0, 0, 'right', [mob], MELEE_REACH)).toHaveLength(1);
  });

  it('hits each foe at most once per swing', () => {
    const mob = foe(0, 30);
    const hit = new Set<unknown>();
    expect(contactHits(0, 0, 'down', [mob], MELEE_REACH, hit)).toHaveLength(1);
    expect(contactHits(0, 0, 'down', [mob], MELEE_REACH, hit)).toHaveLength(0);
  });

  it('gives a big body its extra reach', () => {
    const far = { x: 0, y: 50, allowance: 0 };
    expect(contactHits(0, 0, 'down', [far], MELEE_REACH)).toHaveLength(0);
    expect(contactHits(0, 0, 'down', [{ ...far, allowance: 14 }], MELEE_REACH)).toHaveLength(1);
  });
});
