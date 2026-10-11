import { describe, expect, it } from 'vitest';
import overworld from '../../maps/overworld';
import { checkMap } from './check';
import { Zone } from './zone';

/** A small open grass field; `edit` adds whatever the case under test needs. */
function field(edit: (z: Zone) => void) {
  const z = new Zone(12, 12);
  z.fill('grass');
  edit(z);
  return checkMap(z.toMapData(), z.reasons);
}

describe('checkMap', () => {
  it('passes the real overworld without errors', () => {
    const z = new Zone(overworld.width, overworld.height);
    overworld.build(z);
    expect(checkMap(z.toMapData(), z.reasons).errors).toEqual([]);
  });

  it('accepts a simple valid zone', () => {
    const r = field((z) => {
      z.spawn(2, 2);
      z.npc(4, 4);
      z.mob('shade', 8, 8);
    });
    expect(r.errors).toEqual([]);
  });

  it('errors when the spawn is on a blocked cell', () => {
    const r = field((z) => {
      z.block({ col: 2, row: 2, w: 1, h: 1 }, 'test wall');
      z.spawn(2, 2);
    });
    expect(r.errors.join('\n')).toMatch(/spawn .* blocked cell/);
  });

  it('accepts a shopkeeper in front of a shop building', () => {
    const r = field((z) => {
      z.spawn(2, 2);
      z.prop('smithy', 6, 8);
      z.shop('smithy', 8, 9);
    });
    expect(r.errors).toEqual([]);
  });

  it('errors on an unknown shop, and on a shopkeeper standing inside a building', () => {
    const unknown = field((z) => {
      z.spawn(2, 2);
      z.shop('bakery', 4, 4);
    });
    expect(unknown.errors.join('\n')).toMatch(/unknown shop "bakery"/);
    const inside = field((z) => {
      z.spawn(2, 2);
      z.prop('armory', 6, 10);
      z.shop('armory', 7, 9);
    });
    expect(inside.errors.join('\n')).toMatch(/shopkeeper armory .* blocked cell/);
  });

  it('errors on an unknown mob kind', () => {
    const r = field((z) => {
      z.spawn(2, 2);
      z.mob('dragon', 5, 5);
    });
    expect(r.errors.join('\n')).toMatch(/mob kind "dragon"/);
  });

  it('errors when something is sealed off from the spawn', () => {
    const r = field((z) => {
      z.spawn(1, 1);
      z.block({ col: 6, row: 6, w: 3, h: 3 }, 'moat');
      z.unblock({ col: 7, row: 7, w: 1, h: 1 });
      z.mob('shade', 7, 7);
    });
    expect(r.errors.join('\n')).toMatch(/can't be reached/);
  });

  describe('plateaus', () => {
    const top = { col: 3, row: 2, w: 5, h: 4 }; // rim row 1, face rows 6-7, landing row 8

    it('reach the top through stairs', () => {
      const r = field((z) => {
        z.plateau(top, { stairs: [5] });
        z.spawn(5, 9);
        z.mob('shade', 5, 3);
      });
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    });

    it('seal the top off without stairs', () => {
      const r = field((z) => {
        z.plateau(top);
        z.spawn(5, 9);
        z.mob('shade', 5, 3);
      });
      expect(r.errors.join('\n')).toMatch(/can't be reached/);
    });

    it('error on a gap in the rim', () => {
      const r = field((z) => {
        z.plateau(top, { stairs: [5] });
        z.unblock({ col: 2, row: 3, w: 1, h: 1 }); // west rim
        z.spawn(5, 9);
      });
      expect(r.errors.join('\n')).toMatch(/different levels/);
    });

    it('raise the top one level and open the stairs as ramps', () => {
      const z = new Zone(12, 12);
      z.fill('grass');
      z.plateau(top, { stairs: [5] }).spawn(5, 9);
      const d = z.toMapData();
      expect(d.level[3 * d.width + 4]).toBe(1);
      expect(d.level[9 * d.width + 5]).toBe(0);
      expect(d.ramps).toEqual([6 * d.width + 5, 7 * d.width + 5]);
    });
  });

  it('records the surface of painted ground', () => {
    const z = new Zone(12, 12);
    z.fill('grass');
    z.patch('sand', { col: 2, row: 2, w: 5, h: 5 });
    z.spawn(0, 0);
    const d = z.toMapData();
    const name = (col: number, row: number) => d.surfaces[d.surface[row * d.width + col] ?? 0];
    expect(name(4, 4)).toBe('sand');
    expect(name(0, 0)).toBe('grass');
  });
});
