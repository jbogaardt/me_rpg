import { describe, expect, it } from 'vitest';
import type { Drive } from '../../entities/Mob';
import type { Arena } from './Arena';
import { DmPossession } from './DmPossession';
import type { Simulation } from './Simulation';

function fakeMob(x: number, y: number, name = 'Goblin') {
  const mob = {
    alive: true,
    kind: { name },
    body: { x, y, size: 1 },
    drive: null as Drive | null,
    setDrive(d: Drive | null) {
      mob.drive = d;
    },
  };
  return mob;
}

function game(role: 'host' | 'solo' = 'host', isDm = true) {
  const mobs = [fakeMob(100, 100, 'Near'), fakeMob(400, 400, 'Far'), fakeMob(110, 100, 'Dead')];
  mobs[2]!.alive = false;
  const dmBody = {
    x: 0,
    y: 0,
    visible: true,
    position: { set: (x: number, y: number) => Object.assign(dmBody, { x, y }) },
  };
  const dm = { dm: isDm, hidden: false, body: dmBody };
  const arena = {
    role,
    local: dm,
    view: { world: { x: 10, y: 20, scale: { x: 2 } } },
    get mobs() {
      return mobs;
    },
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
  } as unknown as Arena;
  const sim = { fx: () => {}, text: () => {} } as unknown as Simulation;
  return { p: new DmPossession(arena, sim), mobs, dm, dmBody };
}

// a foe at world (100, 100) stands at screen (10 + 200, 20 + 200) with a zoom of 2; its middle is 20 px above its feet
const onNear = { x: 210, y: 20 + 2 * 80 };

describe('possessing a foe', () => {
  it('takes the living foe under the click, hides the DM and has them ride on it', () => {
    const { p, mobs, dm, dmBody } = game();
    expect(p.clickAt({ x: 0, y: 0 })).toBe(false); // nothing there
    expect(p.clickAt(onNear)).toBe(true);
    expect(p.active).toBe(true);
    expect(p.name).toBe('Near');
    expect(dm.hidden).toBe(true);
    expect([dmBody.x, dmBody.y, dmBody.visible]).toEqual([100, 100, false]);
    expect(p.clickAt(onNear)).toBe(false); // one at a time
    mobs[0]!.body.x = 130;
    p.follow();
    expect(dmBody.x).toBe(130);
  });

  it('lets a finger be a little off: a tap that would miss a click still takes the foe', () => {
    const off = { x: onNear.x + 70, y: onNear.y }; // 35 px away in the world: outside a click's reach, inside a finger's
    expect(game().p.clickAt(off)).toBe(false);
    expect(game().p.clickAt(off, true)).toBe(true);
  });

  it('hands the DM’s keys to the foe, and nothing while a menu has them', () => {
    const { p, mobs } = game();
    p.clickAt(onNear);
    p.drive({ dx: 1, dy: 0, act: true, aim: { x: 0, y: 1 } }, false);
    expect(mobs[0]!.drive).toEqual({ dx: 1, dy: 0, attack: true, aim: { x: 0, y: 1 } });
    p.drive({ dx: 1, dy: 1, act: false }, true);
    expect(mobs[0]!.drive).toEqual({ dx: 0, dy: 0, attack: false });
  });

  it('lets go with the DM where the foe stands, and the foe is its own again', () => {
    const { p, mobs, dm, dmBody } = game();
    p.clickAt(onNear);
    mobs[0]!.body.x = 150;
    p.release();
    expect(p.active).toBe(false);
    expect(mobs[0]!.drive).toBeNull();
    expect([dm.hidden, dmBody.visible, dmBody.x]).toEqual([false, true, 150]);
  });

  it('steps out where a foe falls, since the foe can die and the DM cannot', () => {
    const { p, mobs, dm, dmBody } = game();
    p.clickAt(onNear);
    mobs[0]!.alive = false;
    p.update();
    expect(p.active).toBe(false);
    expect([dm.hidden, dmBody.visible, dmBody.x]).toEqual([false, true, 100]);
  });

  it('is for the DM of a hosted game only', () => {
    expect(game('solo').p.clickAt(onNear)).toBe(false);
    expect(game('host', false).p.clickAt(onNear)).toBe(false);
  });
});
