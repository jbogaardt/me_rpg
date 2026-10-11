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
});
