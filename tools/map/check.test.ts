import { describe, expect, it } from 'vitest';
import { generateAll } from './all';
import { checkCrossings, checkDoors, checkMap } from './check';
import { buildSpec, Zone } from './zone';

/** A small open grass field; `edit` adds whatever the case under test needs. */
function field(edit: (z: Zone) => void) {
  const z = new Zone(12, 12);
  z.fill('grass');
  edit(z);
  return checkMap(z.toMapData(), z.reasons);
}

/** A small field with a door at (2,2) leading to (col,row) of `zone`, and a way back from `zone`. */
function pair(edit: (a: Zone, b: Zone) => void) {
  const a = new Zone(12, 12);
  const b = new Zone(12, 12);
  for (const z of [a, b]) {
    z.fill('grass');
    z.spawn(6, 6);
  }
  edit(a, b);
  return checkDoors(
    new Map([
      ['a', a.toMapData()],
      ['b', b.toMapData()],
    ]),
  );
}

describe('checkDoors', () => {
  it('accepts two zones with a door each way', () => {
    expect(
      pair((a, b) => {
        a.door(2, 2, 2, 'b', 8, 8);
        b.door(9, 9, 1, 'a', 2, 3);
      }),
    ).toEqual([]);
  });

  it('errors on a door to a zone that does not exist', () => {
    const errors = pair((a) => a.door(2, 2, 1, 'nowhere', 1, 1));
    expect(errors.join('\n')).toMatch(/unknown zone "nowhere"/);
  });

  it('errors on an arrival outside the map, on a wall, or on a door (which would bounce the player back)', () => {
    const outside = pair((a, b) => {
      a.door(2, 2, 1, 'b', 20, 1);
      b.door(9, 9, 1, 'a', 2, 3);
    });
    expect(outside.join('\n')).toMatch(/arrives outside "b"/);
    const wall = pair((a, b) => {
      a.door(2, 2, 1, 'b', 5, 5);
      b.block({ col: 5, row: 5, w: 1, h: 1 }, 'wall');
      b.door(9, 9, 1, 'a', 2, 3);
    });
    expect(wall.join('\n')).toMatch(/blocked cell of "b"/);
    const bounce = pair((a, b) => {
      a.door(2, 2, 1, 'b', 9, 9);
      b.door(9, 9, 1, 'a', 2, 3);
    });
    expect(bounce.join('\n')).toMatch(/arrives on a door of "b"/);
  });

  it('errors when the other zone has no way back', () => {
    const errors = pair((a) => a.door(2, 2, 1, 'b', 8, 8));
    expect(errors.join('\n')).toMatch(/"b" has no door back to "a"/);
  });
});

/** Two 40x12 zones, `a` with three doors on its east edge into the west edge of `b`; `edit` spoils `b`. */
function crossing(edit: (b: Zone) => void) {
  const a = new Zone(40, 12);
  const b = new Zone(40, 12);
  for (const z of [a, b]) {
    z.fill('grass');
    z.spawn(20, 6);
  }
  for (let row = 5; row <= 7; row++) {
    a.door(39, row, 1, 'b', 0, row);
    b.door(0, row, 1, 'a', 39, row);
  }
  edit(b);
  const named = (z: Zone, dir: 'left' | 'right') => {
    const d = z.toMapData();
    return { ...d, doors: d.doors.map((x) => ({ ...x, dir })) };
  };
  return checkCrossings(
    new Map([
      ['a', named(a, 'right')],
      ['b', named(b, 'left')],
    ]),
  );
}

describe('checkCrossings', () => {
  it('accepts a clear way through the doors', () => {
    expect(crossing(() => {})).toEqual([]);
  });

  it('errors on a trunk or bush standing in the doorway, even well past the door', () => {
    expect(crossing((b) => b.block({ col: 3, row: 6, w: 1, h: 1 }, 'tree')).join('\n')).toMatch(
      /door \(39,6\) into b \(0,6\): the way ahead is blocked 3 cells past the door/,
    );
  });

  it('errors on an arrival that is walled in, so the player could never walk on', () => {
    const wall = (b: Zone) => b.block({ col: 8, row: 0, w: 1, h: 12 }, 'wall');
    const errors = crossing((b) => (b.spawn(30, 6), wall(b)));
    expect(errors.join('\n')).toMatch(/a dead end/);
  });
});

describe('checkMap doors', () => {
  it('accepts a reachable door and errors on one in a wall or off the map', () => {
    expect(field((z) => (z.spawn(2, 2), z.door(5, 5, 2, 'x', 1, 1))).errors).toEqual([]);
    const walled = field((z) => {
      z.spawn(2, 2);
      z.door(5, 5, 1, 'x', 1, 1);
      z.block({ col: 4, row: 4, w: 3, h: 3 }, 'wall'); // blocked after the door was opened
    });
    expect(walled.errors.join('\n')).toMatch(/door to x .* blocked cell/);
    const off = field((z) => (z.spawn(2, 2), z.door(11, 5, 3, 'x', 1, 1)));
    expect(off.errors.join('\n')).toMatch(/door to x .* outside the map/);
  });
});

describe('checkMap ground (tools/map/ground.ts)', () => {
  const withSpawn = (edit: (z: Zone) => void) =>
    field((z) => {
      z.spawn(1, 1);
      edit(z);
    });
  const seams = (r: { errors: string[] }) => r.errors.filter((e) => e.includes('hard seams'));
  const clashes = (r: { errors: string[] }) => r.errors.filter((e) => e.includes('clashing shades'));

  it('passes plain grass and soft-edged terrain', () => {
    const r = withSpawn((z) => z.paint('sand', { col: 4, row: 4, w: 4, h: 4 }));
    expect([...seams(r), ...clashes(r)]).toEqual([]);
  });

  it('fails a fill dropped on another fill with a hard edge', () => {
    expect(seams(withSpawn((z) => z.fill('crackedStone', { col: 4, row: 4, w: 4, h: 4 })))).toHaveLength(1);
  });

  it('passes a patch, which brings its own edge', () => {
    expect(seams(withSpawn((z) => z.patch('stone', { col: 4, row: 4, w: 5, h: 5 })))).toEqual([]);
  });

  it('fails two shades of grass too far apart, even with a soft edge', () => {
    expect(clashes(withSpawn((z) => z.paint('darkGrass', { col: 3, row: 3, w: 6, h: 6 })))).toHaveLength(1);
  });

  it("keeps a plateau's top the ground of its rim, whatever is painted over it", () => {
    const r = field((z) => {
      z.paint('redDirt', { col: 0, row: 0, w: 12, h: 12 });
      z.plateau({ col: 3, row: 3, w: 6, h: 4 }, { kind: 'dry', stairs: [6] });
      z.spawn(1, 1);
    });
    expect(seams(r)).toEqual([]);
  });
});

describe('checkMap', () => {
  it('passes every real zone without errors; the borders between biomes match and every door has a way back', async () => {
    const { zones, errors } = await generateAll();
    for (const [name, { report }] of zones) expect(report.errors, name).toEqual([]);
    expect(zones.has('greenwood')).toBe(true);
    expect(errors).toEqual([]); // checkSeams and checkDoors over every zone
  }, 120_000);

  it('reads world cells through an origin, but leaves door destinations alone', () => {
    const z = new Zone(10, 10);
    z.fill('grass');
    buildSpec(
      {
        name: 'window',
        width: 10,
        height: 10,
        origin: { col: 5, row: 7 },
        build(w) {
          w.spawn(6, 8); // world cells
          w.door(7, 16, 3, 'elsewhere', 4, 4);
        },
      },
      z,
    );
    const d = z.toMapData();
    expect(d.spawn).toEqual({ col: 1, row: 1 });
    expect(d.doors[0]).toMatchObject({ col: 2, row: 9, w: 3, to: { zone: 'elsewhere', col: 4, row: 4 } });
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
