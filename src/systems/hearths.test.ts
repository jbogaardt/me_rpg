import { describe, expect, it } from 'vitest';
import type { EffectDef } from './particles';
import { PARTICLE_EFFECTS } from './particleEffects';
import { findHearths, hearthNear, HEARTH_EFFECTS, HEARTH_OFFSET, type HearthKind } from './hearths';

const map = (over: Partial<Parameters<typeof findHearths>[0]> = {}) => ({
  width: 10,
  height: 10,
  surface: new Array<number>(100).fill(0),
  surfaces: ['grass', 'lava', 'caveFloor'],
  objects: [],
  indoor: false,
  ...over,
});

describe('findHearths', () => {
  it('finds a fire and a torch by their tags', () => {
    const got = findHearths(
      map({
        objects: [
          { px: 32, py: 64, w: 32, h: 32, tag: 'fire' },
          { px: 96, py: 32, w: 28, h: 60, tag: 'torch' },
          { px: 0, py: 0, w: 32, h: 32, tag: 'rock' },
        ],
      }),
    );
    expect(got.map((s) => s.kind).sort()).toEqual(['fire', 'torch']);
    expect(got.find((s) => s.kind === 'fire')).toMatchObject({ x: 48, y: 80 });
  });

  it('puts bubbles on some lava cells, the same ones every time, and none on grass', () => {
    const surface = new Array<number>(100).fill(1);
    const a = findHearths(map({ surface }));
    expect(a.length).toBeGreaterThan(5);
    expect(a.length).toBeLessThan(40);
    expect(a.every((s) => s.kind === 'lava')).toBe(true);
    expect(findHearths(map({ surface }))).toEqual(a);
    expect(findHearths(map())).toEqual([]);
  });

  it('gives no fireflies indoors', () => {
    const bushes = Array.from({ length: 60 }, (_, i) => ({ px: i * 32, py: 64, w: 32, h: 32, tag: 'bush' }));
    expect(findHearths(map({ objects: bushes })).some((s) => s.kind === 'firefly')).toBe(true);
    expect(findHearths(map({ objects: bushes, indoor: true })).some((s) => s.kind === 'firefly')).toBe(false);
  });
});

describe('hearthNear', () => {
  it('runs a source just off the screen and not one far away', () => {
    const view = { x: 0, y: 0, w: 400, h: 300 };
    expect(hearthNear({ kind: 'fire', x: 420, y: 100 }, view)).toBe(true);
    expect(hearthNear({ kind: 'fire', x: 900, y: 100 }, view)).toBe(false);
  });
});

describe('HEARTH_EFFECTS', () => {
  it.each(Object.entries(HEARTH_EFFECTS) as [HearthKind, readonly string[]][])(
    '%s names real, endless effects',
    (_k, names) => {
      for (const n of names) {
        const def: EffectDef = PARTICLE_EFFECTS[n as keyof typeof PARTICLE_EFFECTS];
        expect(def).toBeDefined();
        for (const e of def.emitters) {
          expect(e.rate ?? 0).toBeGreaterThan(0);
          expect(e.duration).toBeUndefined();
        }
      }
    },
  );
});

describe('water underground', () => {
  const water = () =>
    map({ surface: new Array<number>(100).fill(3), surfaces: ['grass', 'lava', 'caveFloor', 'sewerWater'] });
  it('lifts mist off some of the water and drips into it, the same cells every time', () => {
    const got = findHearths(water());
    const kinds = new Set(got.map((s) => s.kind));
    expect(kinds).toEqual(new Set(['mist', 'drip']));
    expect(got.filter((s) => s.kind === 'mist').length).toBeGreaterThan(4);
    expect(got.filter((s) => s.kind === 'mist').length).toBeLessThan(25);
    expect(findHearths(water())).toEqual(got);
  });
  it('plays a ripple with every drip, 32 px under its bead', () => {
    expect(HEARTH_EFFECTS.drip).toEqual(['drip', 'dripRipple']);
    expect(HEARTH_OFFSET.dripRipple).toBe(32);
    expect(HEARTH_EFFECTS.mist).toEqual(['mist']);
  });
});
